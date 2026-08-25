<?php

declare(strict_types=1);

namespace App\Services;

use App\Support\QualityRevision;
use DateTimeImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Planos de ação das reclamações de cliente.
 *
 * Mora fora do QualityService de propósito: aquele já carrega os três tipos de
 * registro da Qualidade, e o plano tem um ciclo próprio - abre, anda, fecha.
 *
 * As consultas daqui não usam função de data do MySQL. A suíte roda em SQLite na
 * memória, e é isso que permite os testes cobrirem contagem e atraso de verdade;
 * "hoje" entra como parâmetro em vez de CURDATE().
 */
final class ActionPlanService
{
    /** Marcadores automáticos do log. Cada um é uma linha própria da linha do tempo. */
    private const OPENED_NOTE = 'Plano de ação aberto.';

    private const CLOSED_NOTE = 'Plano de ação encerrado.';

    private const REOPENED_NOTE = 'Plano de ação reaberto.';

    /**
     * Os quatro números da aba, sob o filtro atual.
     *
     * @return array{open: int, late: int, closed: int, averageDays: float|null}
     */
    public function cards(array $filters): array
    {
        $params = [];
        $where = $this->conditions($filters, $params);
        $count = fn (string $condition, array $extra = []): int => (int) $this->value(
            'SELECT COUNT(*) FROM complaint_action_plans p
               JOIN customer_complaints c ON c.id = p.customer_complaint_id'
            .$this->narrow($where, $condition),
            $params + $extra
        );

        $open = $count('p.closed_on IS NULL');
        $late = $count(
            'p.closed_on IS NULL AND p.due_on IS NOT NULL AND p.due_on < :today',
            ['today' => now()->toDateString()]
        );
        $closed = $count('p.closed_on IS NOT NULL');

        return ['open' => $open, 'late' => $late, 'closed' => $closed, 'averageDays' => $this->averageDays($filters)];
    }

    /** @return array{total: int, page: int, perPage: int, items: array<int, array<string, mixed>>} */
    public function plans(array $filters, int $page = 1, int $perPage = 25): array
    {
        $params = [];
        $where = $this->conditions($filters, $params);
        $page = max(1, $page);
        $perPage = max(1, min($perPage, 100));
        $offset = ($page - 1) * $perPage;
        $total = (int) $this->value(
            "SELECT COUNT(*) FROM complaint_action_plans p
               JOIN customer_complaints c ON c.id = p.customer_complaint_id{$where}",
            $params
        );

        // Os planos em aberto vêm primeiro: são os que pedem trabalho. Dentro de
        // cada grupo, o mais recente na frente.
        $items = $this->rows(
            "SELECT p.id, p.code, p.opened_on, p.due_on, p.closed_on, p.action, p.root_cause,
                    c.id AS complaint_id, c.code AS complaint_code, c.complaint_date, c.problem,
                    cl.name AS client, t.name AS machine_type, c.model, e.name AS employee,
                    (SELECT COUNT(*) FROM complaint_action_plan_entries n
                      WHERE n.complaint_action_plan_id = p.id) AS entries
               FROM complaint_action_plans p
               JOIN customer_complaints c ON c.id = p.customer_complaint_id
               LEFT JOIN clients cl ON cl.id = c.client_id
               LEFT JOIN machine_types t ON t.id = c.machine_type_id
               LEFT JOIN employees e ON e.id = p.employee_id
               {$where} ORDER BY (p.closed_on IS NULL) DESC, p.opened_on DESC, p.sequence DESC
               LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        return compact('total', 'page', 'perPage', 'items');
    }

    /**
     * O log consolidado da aba: os andamentos de todos os planos do filtro, do
     * mais recente para o mais antigo.
     *
     * @return array<int, array<string, mixed>>
     */
    public function latestEntries(array $filters, int $limit = 20): array
    {
        $params = [];
        $where = $this->conditions($filters, $params);
        $limit = max(1, min($limit, 100));

        return $this->rows(
            "SELECT n.id, n.entry_date, n.note, p.id AS plan_id, p.code AS plan_code,
                    cl.name AS client, u.name AS created_by
               FROM complaint_action_plan_entries n
               JOIN complaint_action_plans p ON p.id = n.complaint_action_plan_id
               JOIN customer_complaints c ON c.id = p.customer_complaint_id
               LEFT JOIN clients cl ON cl.id = c.client_id
               LEFT JOIN users u ON u.id = n.created_by_user_id
               {$where} ORDER BY n.entry_date DESC, n.id DESC LIMIT {$limit}",
            $params
        );
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $rows = $this->rows(
            'SELECT p.*, c.code AS complaint_code, c.complaint_date, c.problem, c.local_treatment,
                    c.quality_alert, cl.name AS client, t.name AS machine_type, c.model,
                    e.name AS employee, u.name AS created_by, u.job_title AS created_by_job_title,
                    cu.name AS closed_by
               FROM complaint_action_plans p
               JOIN customer_complaints c ON c.id = p.customer_complaint_id
               LEFT JOIN clients cl ON cl.id = c.client_id
               LEFT JOIN machine_types t ON t.id = c.machine_type_id
               LEFT JOIN employees e ON e.id = p.employee_id
               LEFT JOIN users u ON u.id = p.created_by_user_id
               LEFT JOIN users cu ON cu.id = p.closed_by_user_id
              WHERE p.id = :id',
            ['id' => $id]
        );
        if ($rows === []) {
            return null;
        }

        $plan = $rows[0];
        $plan['entries'] = $this->entries($id);

        return $plan;
    }

    /** @return array<int, array<string, mixed>> */
    public function entries(int $planId): array
    {
        return $this->rows(
            'SELECT n.id, n.entry_date, n.note, u.name AS created_by, u.job_title AS created_by_job_title
               FROM complaint_action_plan_entries n
               LEFT JOIN users u ON u.id = n.created_by_user_id
              WHERE n.complaint_action_plan_id = :id
              ORDER BY n.entry_date, n.id',
            ['id' => $planId]
        );
    }

    /** @return array<string, mixed> */
    public function create(array $data, int $userId): array
    {
        $id = DB::transaction(function () use ($data, $userId): int {
            $sequence = ((int) DB::table('complaint_action_plans')->lockForUpdate()->max('sequence')) + 1;
            $id = DB::table('complaint_action_plans')->insertGetId([
                'code' => 'PAC'.str_pad((string) $sequence, 2, '0', STR_PAD_LEFT),
                'sequence' => $sequence,
                'customer_complaint_id' => $data['complaintId'],
                'opened_on' => $data['openedOn'],
                'due_on' => $data['dueOn'],
                'employee_id' => $data['employeeId'],
                'root_cause' => $data['rootCause'],
                'action' => $data['action'],
                'created_by_user_id' => $userId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->log($id, $data['openedOn'], self::OPENED_NOTE, $userId);
            if ($data['firstNote'] !== null) {
                $this->log($id, $data['openedOn'], $data['firstNote'], $userId);
            }
            QualityRevision::bump();

            return $id;
        });

        return $this->find($id) ?? [];
    }

    /** @return array<string, mixed>|null */
    public function addEntry(int $planId, array $data, int $userId): ?array
    {
        $done = DB::transaction(function () use ($planId, $data, $userId): bool {
            $plan = DB::table('complaint_action_plans')->where('id', $planId)->lockForUpdate()->first(['id']);
            if ($plan === null) {
                return false;
            }
            $this->log($planId, $data['entryDate'], $data['note'], $userId);
            DB::table('complaint_action_plans')->where('id', $planId)->update(['updated_at' => now()]);
            QualityRevision::bump();

            return true;
        });

        return $done ? $this->find($planId) : null;
    }

    /**
     * Fecha o plano. A data do encerramento é digitada porque a ação quase nunca
     * termina no dia em que alguém volta ao sistema para registrar.
     *
     * @return array{status: int, message: string, plan: array<string, mixed>}
     */
    public function close(int $planId, array $data, int $userId): array
    {
        return DB::transaction(function () use ($planId, $data, $userId): array {
            $plan = DB::table('complaint_action_plans')->where('id', $planId)->lockForUpdate()
                ->first(['id', 'opened_on', 'closed_on']);
            if ($plan === null) {
                return $this->refuse(404, 'Plano de ação não encontrado.');
            }
            if ($plan->closed_on !== null) {
                return $this->refuse(422, 'Este plano de ação já está encerrado.');
            }
            if ($data['closedOn'] < substr((string) $plan->opened_on, 0, 10)) {
                return $this->refuse(422, 'O fechamento não pode ser anterior à abertura do plano.');
            }

            DB::table('complaint_action_plans')->where('id', $planId)->update([
                'closed_on' => $data['closedOn'],
                'closed_by_user_id' => $userId,
                'updated_at' => now(),
            ]);
            $this->log($planId, $data['closedOn'], self::CLOSED_NOTE, $userId);
            if ($data['note'] !== null) {
                $this->log($planId, $data['closedOn'], $data['note'], $userId);
            }
            QualityRevision::bump();

            return ['status' => 200, 'message' => 'Plano de ação encerrado.', 'plan' => $this->find($planId) ?? []];
        });
    }

    /**
     * Desfaz um fechamento errado. Sem isto, a única saída seria excluir o plano
     * e perder o log inteiro junto.
     *
     * @return array{status: int, message: string, plan: array<string, mixed>}
     */
    public function reopen(int $planId, ?string $note, int $userId): array
    {
        return DB::transaction(function () use ($planId, $note, $userId): array {
            $plan = DB::table('complaint_action_plans')->where('id', $planId)->lockForUpdate()
                ->first(['id', 'closed_on']);
            if ($plan === null) {
                return $this->refuse(404, 'Plano de ação não encontrado.');
            }
            if ($plan->closed_on === null) {
                return $this->refuse(422, 'Este plano de ação já está em aberto.');
            }

            DB::table('complaint_action_plans')->where('id', $planId)->update([
                'closed_on' => null,
                'closed_by_user_id' => null,
                'updated_at' => now(),
            ]);
            $today = now()->toDateString();
            $this->log($planId, $today, self::REOPENED_NOTE, $userId);
            if ($note !== null) {
                $this->log($planId, $today, $note, $userId);
            }
            QualityRevision::bump();

            return ['status' => 200, 'message' => 'Plano de ação reaberto.', 'plan' => $this->find($planId) ?? []];
        });
    }

    /** @return array{status: int, message: string, plan: array<string, mixed>} */
    private function refuse(int $status, string $message): array
    {
        return ['status' => $status, 'message' => $message, 'plan' => []];
    }

    public function delete(int $id): ?string
    {
        return DB::transaction(function () use ($id): ?string {
            $plan = DB::table('complaint_action_plans')->where('id', $id)->lockForUpdate()->first(['code']);
            if ($plan === null) {
                return null;
            }
            DB::table('complaint_action_plans')->where('id', $id)->delete();
            QualityRevision::bump();

            return (string) $plan->code;
        });
    }

    /** @return array{success: bool, message: string, data: array<string, mixed>} */
    public function validatePlan(array $input): array
    {
        $fail = static fn (string $message): array => ['success' => false, 'message' => $message, 'data' => []];
        $complaintId = (int) ($input['complaintId'] ?? 0);
        if ($complaintId <= 0 || ! DB::table('customer_complaints')->where('id', $complaintId)->exists()) {
            return $fail('Selecione a reclamação que este plano vai tratar.');
        }
        if (DB::table('complaint_action_plans')->where('customer_complaint_id', $complaintId)->exists()) {
            return $fail('Esta reclamação já tem um plano de ação.');
        }
        $openedOn = $this->date($input['openedOn'] ?? null);
        if ($openedOn === null) {
            return $fail('Informe uma data válida para a abertura do plano.');
        }
        $dueOn = $this->date($input['dueOn'] ?? null);
        if ($dueOn !== null && $dueOn < $openedOn) {
            return $fail('O prazo previsto não pode ser anterior à abertura.');
        }
        $employeeId = (int) ($input['employeeId'] ?? 0);
        if ($employeeId > 0 && ! DB::table('employees')->where('id', $employeeId)->exists()) {
            return $fail('O responsável selecionado não existe mais.');
        }
        $action = $this->text($input['action'] ?? '', 2000);
        if (mb_strlen($action) < 10) {
            return $fail('Descreva a ação planejada com pelo menos 10 caracteres.');
        }

        return ['success' => true, 'message' => '', 'data' => [
            'complaintId' => $complaintId,
            'openedOn' => $openedOn,
            'dueOn' => $dueOn,
            'employeeId' => $employeeId > 0 ? $employeeId : null,
            'rootCause' => $this->text($input['rootCause'] ?? '', 2000) ?: null,
            'action' => $action,
            'firstNote' => $this->text($input['firstNote'] ?? '', 2000) ?: null,
        ]];
    }

    /** @return array{success: bool, message: string, data: array<string, mixed>} */
    public function validateEntry(array $input): array
    {
        $entryDate = $this->date($input['entryDate'] ?? null);
        if ($entryDate === null) {
            return ['success' => false, 'message' => 'Informe uma data válida para o andamento.', 'data' => []];
        }
        $note = $this->text($input['note'] ?? '', 2000);
        if (mb_strlen($note) < 3) {
            return ['success' => false, 'message' => 'Escreva o andamento antes de gravar.', 'data' => []];
        }

        return ['success' => true, 'message' => '', 'data' => ['entryDate' => $entryDate, 'note' => $note]];
    }

    /** @return array{success: bool, message: string, data: array<string, mixed>} */
    public function validateClose(array $input): array
    {
        $closedOn = $this->date($input['closedOn'] ?? null);
        if ($closedOn === null) {
            return ['success' => false, 'message' => 'Informe a data em que a ação foi concluída.', 'data' => []];
        }

        return ['success' => true, 'message' => '', 'data' => [
            'closedOn' => $closedOn,
            'note' => $this->text($input['note'] ?? '', 2000) ?: null,
        ]];
    }

    public function note(mixed $value): ?string
    {
        return $this->text($value, 2000) ?: null;
    }

    private function log(int $planId, string $date, string $note, int $userId): void
    {
        DB::table('complaint_action_plan_entries')->insert([
            'complaint_action_plan_id' => $planId,
            'entry_date' => $date,
            'note' => $note,
            'created_by_user_id' => $userId,
            'created_at' => now(),
        ]);
    }

    /**
     * Média de dias entre abertura e fechamento, calculada em PHP: DATEDIFF é do
     * MySQL e julianday é do SQLite, e o volume de reclamações é de dezenas.
     */
    private function averageDays(array $filters): ?float
    {
        $params = [];
        $where = $this->conditions($filters, $params);
        $rows = $this->rows(
            'SELECT p.opened_on, p.closed_on FROM complaint_action_plans p
               JOIN customer_complaints c ON c.id = p.customer_complaint_id'
            .$this->narrow($where, 'p.closed_on IS NOT NULL'),
            $params
        );
        if ($rows === []) {
            return null;
        }

        $total = 0;
        foreach ($rows as $row) {
            $opened = new DateTimeImmutable(substr((string) $row['opened_on'], 0, 10));
            $closed = new DateTimeImmutable(substr((string) $row['closed_on'], 0, 10));
            $total += (int) $opened->diff($closed)->days;
        }

        return round($total / count($rows), 1);
    }

    /**
     * O recorte da barra de filtros aplicado ao plano: o período mede a abertura
     * do plano, e cliente, máquina e modelo vêm da reclamação de origem.
     *
     * @param  array<string, mixed>  $filters
     */
    private function conditions(array $filters, array &$params): string
    {
        $conditions = [];
        $map = [
            'model' => ['c.model', 'model'],
            'machineTypeId' => ['c.machine_type_id', 'machine_type_id'],
            'clientId' => ['c.client_id', 'client_id'],
            'employeeId' => ['p.employee_id', 'employee_id'],
        ];
        foreach ($map as $key => [$column, $parameter]) {
            if (($filters[$key] ?? null) !== null) {
                $conditions[] = "{$column} = :{$parameter}";
                $params[$parameter] = $filters[$key];
            }
        }
        if (($filters['year'] ?? null) !== null) {
            $conditions[] = 'p.opened_on >= :year_start AND p.opened_on <= :year_end';
            $params['year_start'] = sprintf('%04d-01-01', $filters['year']);
            $params['year_end'] = sprintf('%04d-12-31', $filters['year']);
        }
        if (($filters['month'] ?? null) !== null) {
            // Sem YEAR()/MONTH(): o mês vira intervalo de datas, que SQLite e
            // MySQL comparam igual. Sem ano escolhido, vale o mês de cada ano.
            $conditions[] = $this->monthCondition((int) $filters['month'], $filters['year'], $params);
        }
        if (($filters['startDate'] ?? null) !== null) {
            $conditions[] = 'p.opened_on >= :start_date';
            $params['start_date'] = $filters['startDate'];
        }
        if (($filters['endDate'] ?? null) !== null) {
            $conditions[] = 'p.opened_on <= :end_date';
            $params['end_date'] = $filters['endDate'];
        }

        return $conditions === [] ? '' : ' WHERE '.implode(' AND ', $conditions);
    }

    /** Recorte de um mês, como intervalo fechado de datas. */
    private function monthCondition(int $month, ?int $year, array &$params): string
    {
        $month = max(1, min(12, $month));
        if ($year !== null) {
            $first = new DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month));
            $params['month_start'] = $first->format('Y-m-d');
            $params['month_end'] = $first->modify('last day of this month')->format('Y-m-d');

            return 'p.opened_on >= :month_start AND p.opened_on <= :month_end';
        }

        // Sem ano, o mês precisa casar em qualquer ano: é a posição 6 e 7 do
        // 'YYYY-MM-DD', que as duas bases devolvem igual por SUBSTR.
        $params['month_text'] = sprintf('%02d', $month);

        return 'SUBSTR(p.opened_on, 6, 2) = :month_text';
    }

    /** Junta a condição fixa da consulta ao recorte já montado. */
    private function narrow(string $where, string $condition): string
    {
        return $where === '' ? " WHERE {$condition}" : "{$where} AND {$condition}";
    }

    /** @return array<int, array<string, mixed>> */
    private function rows(string $sql, array $params = []): array
    {
        return array_map(static fn (object $row): array => (array) $row, DB::select($sql, $params));
    }

    private function value(string $sql, array $params = []): mixed
    {
        $row = DB::selectOne($sql, $params);

        return $row === null ? false : array_values((array) $row)[0];
    }

    private function text(mixed $value, int $limit): string
    {
        $value = is_string($value) ? trim(preg_replace('/\s+/', ' ', $value) ?? '') : '';

        return mb_substr($value, 0, $limit);
    }

    private function date(mixed $value): ?string
    {
        $value = is_string($value) ? trim($value) : '';
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

        return $parsed && $parsed->format('Y-m-d') === $value ? $value : null;
    }
}
