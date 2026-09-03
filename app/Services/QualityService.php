<?php

declare(strict_types=1);

namespace App\Services;

use App\Support\QualityRevision;
use DateTimeImmutable;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class QualityService
{
    public const ACTION_TYPES = ['CORREÇÃO', 'RNC', 'CORRETIVA'];

    public const SECTORS = ['PRODUÇÃO', 'QUALIDADE', 'EXPEDIÇÃO'];

    public const PROBLEM_TYPES = [
        'MECÂNICO', 'ELÉTRICO', 'AVARIA/ESTÉTICA', 'FINALIZAÇÃO DA MÁQUINA',
        'TESTES DE FUNCIONAMENTO', 'PARAMETRIZAÇÃO', 'SEPARAÇÃO DE ITENS', 'PALETIZAÇÃO',
    ];

    /*
     * O plano de ação viaja com a reclamação nas três consultas que a devolvem:
     * é ele que responde "essa reclamação foi tratada, e quando fechou?". O
     * vínculo é um para um, então o LEFT JOIN nunca duplica a linha.
     */
    private const PLAN_JOIN = 'LEFT JOIN complaint_action_plans p ON p.customer_complaint_id = c.id';

    private const PLAN_COLUMNS = 'p.id AS plan_id, p.code AS plan_code, p.opened_on AS plan_opened_on,
                    p.due_on AS plan_due_on, p.closed_on AS plan_closed_on';

    /** @return array<string, mixed> */
    public function filters(array $input): array
    {
        $integer = static fn (mixed $value): ?int => is_numeric($value) && (int) $value > 0
            ? (int) $value : null;
        $string = static function (mixed $value): ?string {
            $value = is_string($value) ? trim($value) : '';

            return $value === '' ? null : mb_substr($value, 0, 80);
        };
        $date = static function (mixed $value): ?string {
            $value = is_string($value) ? trim($value) : '';
            $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

            return $parsed !== false && $parsed->format('Y-m-d') === $value ? $value : null;
        };
        $month = $integer($input['month'] ?? null);
        $startDate = $date($input['startDate'] ?? null);
        $endDate = $date($input['endDate'] ?? null);
        if ($startDate !== null && $endDate !== null && $startDate > $endDate) {
            [$startDate, $endDate] = [$endDate, $startDate];
        }
        // Recorte pelo plano de ação. Não está na barra de filtros de propósito:
        // quem usa é o diálogo que procura a reclamação ainda sem plano.
        $planStatus = is_string($input['planStatus'] ?? null) ? $input['planStatus'] : null;

        return [
            'planStatus' => in_array($planStatus, ['none', 'open', 'closed', 'late'], true) ? $planStatus : null,
            'year' => $integer($input['year'] ?? null),
            'month' => $month !== null && $month <= 12 ? $month : null,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'shed' => $string($input['shed'] ?? null),
            'gate' => $string($input['gate'] ?? null),
            'problemType' => $string($input['problemType'] ?? null),
            'model' => $string($input['model'] ?? null),
            'codeId' => $integer($input['codeId'] ?? null),
            'machineTypeId' => $integer($input['machineTypeId'] ?? null),
            'employeeId' => $integer($input['employeeId'] ?? null),
            'clientId' => $integer($input['clientId'] ?? null),
        ];
    }

    /** @return array<string, mixed> */
    public function options(): array
    {
        $models = $this->rows(
            'SELECT m.id, m.name, m.machine_type_id, t.name AS machine_type
               FROM machine_models m JOIN machine_types t ON t.id = m.machine_type_id
              ORDER BY t.name, m.name'
        );

        // Catálogos vêm inteiros, com a marca de ativo: o formulário de RAP só
        // oferece os ativos, mas o filtro e os gráficos precisam do histórico
        // completo - senão os RAPs de um gate desativado ficariam inalcançáveis.
        return [
            'codes' => array_map(static fn (array $row): array => [
                'id' => (int) $row['id'],
                'code' => (string) $row['code'],
                'description' => (string) $row['description'],
                'active' => (bool) $row['is_active'],
            ], $this->rows('SELECT id, code, description, is_active FROM quality_codes ORDER BY position, code')),
            'employees' => $this->rows('SELECT id, name FROM employees WHERE is_active = 1 ORDER BY name'),
            'machineTypes' => $this->rows('SELECT id, name FROM machine_types ORDER BY name'),
            'machineModels' => array_map(static fn (array $row): array => [
                'id' => (int) $row['id'],
                'name' => (string) $row['name'],
                'machineTypeId' => (int) $row['machine_type_id'],
                'machineType' => (string) $row['machine_type'],
            ], $models),
            'clients' => $this->rows('SELECT id, name FROM clients ORDER BY name'),
            'sheds' => array_column($this->rows(
                "SELECT DISTINCT shed FROM inspection_reports WHERE shed IS NOT NULL AND shed <> '' ORDER BY shed"
            ), 'shed'),
            'years' => array_map('intval', array_column($this->rows(
                'SELECT DISTINCT YEAR(report_date) AS year FROM inspection_reports
                 UNION SELECT DISTINCT YEAR(dispatch_date) FROM machine_dispatches ORDER BY year DESC'
            ), 'year')),
            'gates' => array_map(static fn (array $row): array => [
                'name' => (string) $row['name'],
                'active' => (bool) $row['is_active'],
            ], $this->rows('SELECT name, is_active FROM quality_gates ORDER BY position, name')),
            'sectors' => self::SECTORS,
            'problemTypes' => self::PROBLEM_TYPES,
            'actionTypes' => self::ACTION_TYPES,
            'targets' => ['rapsPerMonth' => $this->rapsMonthlyTarget()],
        ];
    }

    /** Teto de RAPs por mês configurado na engrenagem, ou null quando não há meta. */
    private function rapsMonthlyTarget(): ?int
    {
        $value = DB::table('quality_settings')
            ->where('name', QualitySettingsService::TARGET_RAPS_PER_MONTH)
            ->value('value');

        return $value === null || $value === '' ? null : (int) $value;
    }

    /** @return array<string, mixed> */
    public function dashboard(array $filters): array
    {
        $reportParams = [];
        $reportWhere = $this->reportConditions($filters, $reportParams);
        $dispatchParams = [];
        $dispatchWhere = $this->dispatchConditions($filters, $dispatchParams);
        $complaintParams = [];
        $complaintWhere = $this->complaintConditions($filters, $complaintParams);

        $totalReports = (int) $this->value("SELECT COUNT(*) FROM inspection_reports r{$reportWhere}", $reportParams);
        $totalDispatches = (int) $this->value("SELECT COUNT(*) FROM machine_dispatches d{$dispatchWhere}", $dispatchParams);
        $totalComplaints = (int) $this->value("SELECT COUNT(*) FROM customer_complaints c{$complaintWhere}", $complaintParams);
        $reportsByPeriod = $this->periodSeries($this->rows(
            "SELECT DATE_FORMAT(r.report_date, '%Y-%m') AS period, COUNT(*) AS total
               FROM inspection_reports r{$reportWhere} GROUP BY period ORDER BY period",
            $reportParams
        ));
        $latestPeriod = $reportsByPeriod === [] ? null : end($reportsByPeriod);
        $byGate = $this->rows(
            "SELECT DATE_FORMAT(r.report_date, '%Y-%m') AS period, COALESCE(r.gate, '-') AS gate, COUNT(*) AS total
               FROM inspection_reports r{$reportWhere} GROUP BY period, gate ORDER BY period, gate",
            $reportParams
        );

        return [
            'cards' => [
                'totalReports' => $totalReports,
                'latestPeriodReports' => $latestPeriod['value'] ?? 0,
                'latestPeriodLabel' => $latestPeriod['label'] ?? '-',
                'clients' => (int) $this->value(
                    "SELECT COUNT(DISTINCT r.client_id) FROM inspection_reports r{$reportWhere}", $reportParams
                ),
                'models' => (int) $this->value(
                    "SELECT COUNT(DISTINCT r.model) FROM inspection_reports r{$reportWhere}", $reportParams
                ),
                'machineTypes' => (int) $this->value(
                    "SELECT COUNT(DISTINCT r.machine_type_id) FROM inspection_reports r{$reportWhere}", $reportParams
                ),
                'totalDispatches' => $totalDispatches,
                'totalComplaints' => $totalComplaints,
                'satisfactionRate' => $totalDispatches > 0
                    ? round((1 - $totalComplaints / $totalDispatches) * 100, 1) : null,
                'complaintRate' => $totalDispatches > 0
                    ? round($totalComplaints / $totalDispatches * 100, 1) : null,
                'highlightMachine' => $this->value(
                    "SELECT t.name FROM machine_dispatches d JOIN machine_types t ON t.id = d.machine_type_id
                     {$dispatchWhere} GROUP BY t.id, t.name ORDER BY COUNT(*) DESC LIMIT 1",
                    $dispatchParams
                ) ?: null,
                'highlightModel' => $this->value(
                    "SELECT d.model FROM machine_dispatches d {$dispatchWhere} "
                    .($dispatchWhere === '' ? 'WHERE' : 'AND').' d.model IS NOT NULL
                     GROUP BY d.model ORDER BY COUNT(*) DESC LIMIT 1',
                    $dispatchParams
                ) ?: null,
            ],
            'reportsByPeriod' => $reportsByPeriod,
            'reportsByProblemType' => $this->castSeries($this->rows(
                "SELECT COALESCE(r.problem_type, '-') AS label, COUNT(*) AS value
                   FROM inspection_reports r{$reportWhere} GROUP BY label ORDER BY value DESC",
                $reportParams
            )),
            'reportsByCode' => $this->castSeries($this->rows(
                "SELECT c.code AS label, c.description, COUNT(r.id) AS value
                   FROM quality_codes c JOIN inspection_reports r ON r.quality_code_id = c.id
                   {$reportWhere} GROUP BY c.id, c.code, c.description ORDER BY value DESC",
                $reportParams
            )),
            'reportsByShed' => $this->castSeries($this->rows(
                "SELECT COALESCE(r.shed, '-') AS label, COUNT(*) AS value
                   FROM inspection_reports r{$reportWhere} GROUP BY label ORDER BY value DESC",
                $reportParams
            )),
            'reportsByGate' => array_map(fn (array $row): array => [
                'period' => (string) $row['period'],
                'label' => $this->periodLabel((string) $row['period']),
                'gate' => (string) $row['gate'],
                'value' => (int) $row['total'],
            ], $byGate),
            'reportsByModel' => $this->castSeries($this->rows(
                "SELECT COALESCE(r.model, '-') AS label, MAX(CONCAT('Linha ', t.name)) AS description, COUNT(*) AS value
                   FROM inspection_reports r LEFT JOIN machine_types t ON t.id = r.machine_type_id
                   {$reportWhere} GROUP BY label ORDER BY value DESC",
                $reportParams
            )),
            'reportsByMachineType' => $this->castSeries($this->rows(
                "SELECT t.name AS label, COUNT(r.id) AS value
                   FROM machine_types t JOIN inspection_reports r ON r.machine_type_id = t.id
                   {$reportWhere} GROUP BY t.id, t.name ORDER BY value DESC",
                $reportParams
            )),
            'reportsByEmployee' => $this->castSeries($this->rows(
                "SELECT e.name AS label, COUNT(*) AS value
                   FROM inspection_report_employees re
                   JOIN employees e ON e.id = re.employee_id
                   JOIN inspection_reports r ON r.id = re.inspection_report_id
                   {$reportWhere} GROUP BY e.id, e.name ORDER BY value DESC LIMIT 20",
                $reportParams
            )),
            'dispatchesByPeriod' => $this->periodSeries($this->rows(
                "SELECT DATE_FORMAT(d.dispatch_date, '%Y-%m') AS period, COUNT(*) AS total
                   FROM machine_dispatches d{$dispatchWhere} GROUP BY period ORDER BY period",
                $dispatchParams
            )),
            'dispatchesByMachineType' => $this->castSeries($this->rows(
                "SELECT t.name AS label, COUNT(d.id) AS value
                   FROM machine_types t JOIN machine_dispatches d ON d.machine_type_id = t.id
                   {$dispatchWhere} GROUP BY t.id, t.name ORDER BY value DESC",
                $dispatchParams
            )),
            'dispatchesByModel' => $this->castSeries($this->rows(
                "SELECT COALESCE(d.model, '-') AS label, MAX(CONCAT('Linha ', t.name)) AS description, COUNT(*) AS value
                   FROM machine_dispatches d LEFT JOIN machine_types t ON t.id = d.machine_type_id
                   {$dispatchWhere} GROUP BY label ORDER BY value DESC",
                $dispatchParams
            )),
            'complaintsByPeriod' => $this->periodSeries($this->rows(
                "SELECT DATE_FORMAT(c.complaint_date, '%Y-%m') AS period, COUNT(*) AS total
                   FROM customer_complaints c{$complaintWhere} GROUP BY period ORDER BY period",
                $complaintParams
            )),
            'complaints' => $this->rows(
                'SELECT c.id, c.code, c.complaint_date, cl.name AS client, t.name AS machine_type,
                        c.model, c.problem, '.self::PLAN_COLUMNS.'
                   FROM customer_complaints c
                   LEFT JOIN clients cl ON cl.id = c.client_id
                   LEFT JOIN machine_types t ON t.id = c.machine_type_id
                   '.self::PLAN_JOIN."
                   {$complaintWhere} ORDER BY c.complaint_date DESC LIMIT 50",
                $complaintParams
            ),
        ];
    }

    /** @return array{total: int, page: int, perPage: int, items: array<int, array<string, mixed>>} */
    public function reports(array $filters, int $page = 1, int $perPage = 25): array
    {
        $params = [];
        $where = $this->reportConditions($filters, $params);
        $page = max(1, $page);
        $perPage = max(1, min($perPage, 100));
        $offset = ($page - 1) * $perPage;
        $total = (int) $this->value("SELECT COUNT(*) FROM inspection_reports r{$where}", $params);
        $items = $this->rows(
            "SELECT r.id, r.code, r.report_date, r.action_type, r.shed, r.sector, r.gate,
                    r.problem_type, r.model, r.description, r.immediate_action,
                    r.needs_checklist_update, cl.name AS client, t.name AS machine_type,
                    q.code AS quality_code, q.description AS quality_code_description,
                    report_employees.employees
               FROM inspection_reports r
               LEFT JOIN clients cl ON cl.id = r.client_id
               LEFT JOIN machine_types t ON t.id = r.machine_type_id
               LEFT JOIN quality_codes q ON q.id = r.quality_code_id
               LEFT JOIN (
                    SELECT re.inspection_report_id,
                           GROUP_CONCAT(e.name ORDER BY re.position SEPARATOR ' | ') AS employees
                      FROM inspection_report_employees re
                      JOIN employees e ON e.id = re.employee_id
                     GROUP BY re.inspection_report_id
               ) report_employees ON report_employees.inspection_report_id = r.id
               {$where} ORDER BY r.report_date DESC, r.sequence DESC
               LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        return compact('total', 'page', 'perPage', 'items');
    }

    /** @return array{total: int, page: int, perPage: int, items: array<int, array<string, mixed>>} */
    public function dispatches(array $filters, int $page = 1, int $perPage = 25): array
    {
        $params = [];
        $where = $this->dispatchConditions($filters, $params);
        $page = max(1, $page);
        $perPage = max(1, min($perPage, 100));
        $offset = ($page - 1) * $perPage;
        $total = (int) $this->value("SELECT COUNT(*) FROM machine_dispatches d{$where}", $params);
        $items = $this->rows(
            "SELECT d.id, d.code, d.dispatch_date, d.model, d.notes, cl.name AS client,
                    t.name AS machine_type,
                    (SELECT COUNT(*) FROM machine_dispatch_photos p WHERE p.machine_dispatch_id = d.id) AS photos
               FROM machine_dispatches d
               LEFT JOIN clients cl ON cl.id = d.client_id
               LEFT JOIN machine_types t ON t.id = d.machine_type_id
               {$where} ORDER BY d.dispatch_date DESC, d.sequence DESC
               LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        return compact('total', 'page', 'perPage', 'items');
    }

    /**
     * A mesma lista que o dashboard devolve em `complaints`, só que paginada: lá
     * ela alimenta o gráfico e para no teto de 50; aqui ela é a consulta da aba
     * Registros e precisa alcançar o histórico inteiro.
     *
     * @return array{total: int, page: int, perPage: int, items: array<int, array<string, mixed>>}
     */
    public function complaints(array $filters, int $page = 1, int $perPage = 25): array
    {
        $params = [];
        $where = $this->complaintConditions($filters, $params);
        $page = max(1, $page);
        $perPage = max(1, min($perPage, 100));
        $offset = ($page - 1) * $perPage;
        $total = (int) $this->value("SELECT COUNT(*) FROM customer_complaints c{$where}", $params);
        $items = $this->rows(
            'SELECT c.id, c.code, c.complaint_date, cl.name AS client, t.name AS machine_type,
                    c.model, c.problem, '.self::PLAN_COLUMNS.'
               FROM customer_complaints c
               LEFT JOIN clients cl ON cl.id = c.client_id
               LEFT JOIN machine_types t ON t.id = c.machine_type_id
               '.self::PLAN_JOIN."
               {$where} ORDER BY c.complaint_date DESC, c.sequence DESC
               LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        return compact('total', 'page', 'perPage', 'items');
    }

    /** @return array<string, mixed>|null */
    public function findReport(int $id): ?array
    {
        $rows = $this->rows(
            'SELECT r.*, cl.name AS client, t.name AS machine_type,
                    q.code AS quality_code, q.description AS quality_code_description,
                    u.name AS created_by, u.job_title AS created_by_job_title
               FROM inspection_reports r
               LEFT JOIN clients cl ON cl.id = r.client_id
               LEFT JOIN machine_types t ON t.id = r.machine_type_id
               LEFT JOIN quality_codes q ON q.id = r.quality_code_id
               LEFT JOIN users u ON u.id = r.created_by_user_id
              WHERE r.id = :id',
            ['id' => $id]
        );
        if ($rows === []) {
            return null;
        }

        $report = $rows[0];
        $employees = $this->rows(
            'SELECT e.id, e.name FROM inspection_report_employees re
               JOIN employees e ON e.id = re.employee_id
              WHERE re.inspection_report_id = :id ORDER BY re.position',
            ['id' => $id]
        );
        $report['employees'] = array_column($employees, 'name');
        $report['employee_ids'] = array_map('intval', array_column($employees, 'id'));
        $report['edit_history'] = $this->editHistory('report', $id);

        return $report;
    }

    /** @return array<string, mixed>|null */
    public function findDispatch(int $id): ?array
    {
        $rows = $this->rows(
            'SELECT d.*, cl.name AS client, t.name AS machine_type,
                    u.name AS created_by, u.job_title AS created_by_job_title
               FROM machine_dispatches d
               LEFT JOIN clients cl ON cl.id = d.client_id
               LEFT JOIN machine_types t ON t.id = d.machine_type_id
               LEFT JOIN users u ON u.id = d.created_by_user_id
              WHERE d.id = :id',
            ['id' => $id]
        );
        if ($rows === []) {
            return null;
        }

        $dispatch = $rows[0];
        $employees = $this->rows(
            'SELECT e.id, e.name FROM machine_dispatch_employees de
               JOIN employees e ON e.id = de.employee_id
              WHERE de.machine_dispatch_id = :id ORDER BY de.position',
            ['id' => $id]
        );
        $dispatch['employees'] = array_column($employees, 'name');
        $dispatch['employee_ids'] = array_map('intval', array_column($employees, 'id'));
        $dispatch['photos'] = array_column($this->rows(
            'SELECT path FROM machine_dispatch_photos WHERE machine_dispatch_id = :id ORDER BY position',
            ['id' => $id]
        ), 'path');
        $dispatch['edit_history'] = $this->editHistory('dispatch', $id);

        return $dispatch;
    }

    /** @return array<string, mixed>|null */
    public function findComplaint(int $id): ?array
    {
        $rows = $this->rows(
            'SELECT c.*, cl.name AS client, t.name AS machine_type,
                    u.name AS created_by, u.job_title AS created_by_job_title,
                    '.self::PLAN_COLUMNS.', p.action AS plan_action, p.root_cause AS plan_root_cause,
                    e.name AS plan_employee
               FROM customer_complaints c
               LEFT JOIN clients cl ON cl.id = c.client_id
               LEFT JOIN machine_types t ON t.id = c.machine_type_id
               LEFT JOIN users u ON u.id = c.created_by_user_id
               '.self::PLAN_JOIN.'
               LEFT JOIN employees e ON e.id = p.employee_id
              WHERE c.id = :id',
            ['id' => $id]
        );
        if ($rows === []) {
            return null;
        }

        // Os andamentos vão junto: a folha impressa do RSC mostra a tratativa
        // inteira, e não só a data em que ela foi encerrada.
        $complaint = $rows[0];
        $complaint['plan_entries'] = $complaint['plan_id'] === null ? [] : $this->rows(
            'SELECT n.entry_date, n.note, u.name AS created_by
               FROM complaint_action_plan_entries n
               LEFT JOIN users u ON u.id = n.created_by_user_id
              WHERE n.complaint_action_plan_id = :id ORDER BY n.entry_date, n.id',
            ['id' => $complaint['plan_id']]
        );
        $complaint['edit_history'] = $this->editHistory('complaint', $id);

        return $complaint;
    }

    /** @return array{report: array<string, mixed>, changed: bool}|null */
    public function updateReport(int $id, array $data, int $userId): ?array
    {
        return DB::transaction(function () use ($id, $data, $userId): ?array {
            $record = DB::table('inspection_reports')->where('id', $id)
                ->lockForUpdate()->first(['id', 'code']);
            if ($record === null) {
                return null;
            }

            $before = $this->findReport($id);
            if ($before === null) {
                return null;
            }

            $clientId = $this->clientId($data['client']);
            $projected = [
                'report_date' => $data['reportDate'],
                'action_type' => $data['actionType'],
                'client' => $this->recordName('clients', $clientId),
                'machine_type' => $this->recordName('machine_types', $data['machineTypeId']),
                'model' => $data['model'],
                'shed' => $data['shed'],
                'sector' => $data['sector'],
                'gate' => $data['gate'],
                'problem_type' => $data['problemType'],
                'quality_code' => $this->qualityCode($data['qualityCodeId']),
                'description' => $data['description'],
                'needs_checklist_update' => $data['needsChecklistUpdate'],
                'checklist_change' => $data['checklistChange'],
                'immediate_action' => $data['immediateAction'],
                'employees' => $this->employeeNames($data['employeeIds']),
            ];
            $changes = $this->changedFields(
                $this->reportSnapshot($before),
                $this->reportSnapshot($projected)
            );

            if ($changes === []) {
                return ['report' => $before, 'changed' => false];
            }

            DB::table('inspection_reports')->where('id', $id)->update([
                'report_date' => $data['reportDate'],
                'action_type' => $data['actionType'],
                'client_id' => $clientId,
                'machine_type_id' => $data['machineTypeId'],
                'model' => $data['model'],
                'shed' => $data['shed'],
                'sector' => $data['sector'],
                'gate' => $data['gate'],
                'problem_type' => $data['problemType'],
                'quality_code_id' => $data['qualityCodeId'],
                'description' => $data['description'],
                'needs_checklist_update' => $data['needsChecklistUpdate'],
                'checklist_change' => $data['checklistChange'],
                'immediate_action' => $data['immediateAction'],
                'updated_at' => now(),
            ]);
            $this->replaceEmployeeIds(
                'inspection_report_employees',
                'inspection_report_id',
                $id,
                $data['employeeIds']
            );
            $this->writeEdit('report', $id, (string) $record->code, $userId, $changes);
            QualityRevision::bump();

            return ['report' => $this->findReport($id) ?? [], 'changed' => true];
        });
    }

    /**
     * @param list<string> $keptPhotoPaths
     * @param list<string> $newPhotoPaths
     * @return array{dispatch: array<string, mixed>, changed: bool, removedPhotos: list<string>}|null
     */
    public function updateDispatch(
        int $id,
        array $data,
        array $keptPhotoPaths,
        array $newPhotoPaths,
        int $userId
    ): ?array {
        return DB::transaction(function () use (
            $id, $data, $keptPhotoPaths, $newPhotoPaths, $userId
        ): ?array {
            $record = DB::table('machine_dispatches')->where('id', $id)
                ->lockForUpdate()->first(['id', 'code']);
            if ($record === null) {
                return null;
            }

            $before = $this->findDispatch($id);
            if ($before === null) {
                return null;
            }

            $currentPhotos = array_values(array_map('strval', $before['photos']));
            $keptPhotoPaths = array_values(array_unique(array_map('strval', $keptPhotoPaths)));
            $newPhotoPaths = array_values(array_unique(array_map('strval', $newPhotoPaths)));
            if (array_diff($keptPhotoPaths, $currentPhotos) !== []) {
                throw new InvalidArgumentException('Uma das fotos mantidas não pertence a esta coleta.');
            }
            $finalPhotos = array_values(array_merge($keptPhotoPaths, $newPhotoPaths));
            if (count($finalPhotos) < 1 || count($finalPhotos) > 6) {
                throw new InvalidArgumentException('Mantenha entre uma e seis fotos do carregamento.');
            }

            $clientId = $this->clientId($data['client']);
            $projected = [
                'dispatch_date' => $data['dispatchDate'],
                'client' => $this->recordName('clients', $clientId),
                'machine_type' => $this->recordName('machine_types', $data['machineTypeId']),
                'model' => $data['model'],
                'notes' => $data['notes'],
                'needs_form_update' => $data['needsFormUpdate'],
                'form_change' => $data['formChange'],
                'immediate_action' => $data['immediateAction'],
                'employees' => $this->employeeNames($data['employeeIds']),
                'photos' => $finalPhotos,
            ];
            $changes = $this->changedFields(
                $this->dispatchSnapshot($before),
                $this->dispatchSnapshot($projected)
            );

            if ($changes === []) {
                return ['dispatch' => $before, 'changed' => false, 'removedPhotos' => []];
            }

            DB::table('machine_dispatches')->where('id', $id)->update([
                'dispatch_date' => $data['dispatchDate'],
                'client_id' => $clientId,
                'machine_type_id' => $data['machineTypeId'],
                'model' => $data['model'],
                'notes' => $data['notes'],
                'needs_form_update' => $data['needsFormUpdate'],
                'form_change' => $data['formChange'],
                'immediate_action' => $data['immediateAction'],
                'updated_at' => now(),
            ]);
            $this->replaceEmployeeIds(
                'machine_dispatch_employees',
                'machine_dispatch_id',
                $id,
                $data['employeeIds']
            );

            if (array_key_exists('photos', $changes)) {
                DB::table('machine_dispatch_photos')->where('machine_dispatch_id', $id)->delete();
                DB::table('machine_dispatch_photos')->insert(array_map(
                    static fn (string $path, int $position): array => [
                        'machine_dispatch_id' => $id,
                        'path' => $path,
                        'position' => $position + 1,
                        'created_at' => now(),
                    ],
                    $finalPhotos,
                    array_keys($finalPhotos)
                ));
            }

            $this->writeEdit('dispatch', $id, (string) $record->code, $userId, $changes);
            QualityRevision::bump();

            return [
                'dispatch' => $this->findDispatch($id) ?? [],
                'changed' => true,
                'removedPhotos' => array_values(array_diff($currentPhotos, $finalPhotos)),
            ];
        });
    }

    /** @return array{complaint: array<string, mixed>, changed: bool}|null */
    public function updateComplaint(int $id, array $data, int $userId): ?array
    {
        return DB::transaction(function () use ($id, $data, $userId): ?array {
            $record = DB::table('customer_complaints')->where('id', $id)
                ->lockForUpdate()->first(['id', 'code']);
            if ($record === null) {
                return null;
            }

            $before = $this->findComplaint($id);
            if ($before === null) {
                return null;
            }

            $clientId = $this->clientId($data['client']);
            $projected = [
                'complaint_date' => $data['complaintDate'],
                'client' => $this->recordName('clients', $clientId),
                'machine_type' => $this->recordName('machine_types', $data['machineTypeId']),
                'model' => $data['model'],
                'problem' => $data['problem'],
                'local_treatment' => $data['localTreatment'],
                'quality_alert' => $data['qualityAlert'],
            ];
            $changes = $this->changedFields(
                $this->complaintSnapshot($before),
                $this->complaintSnapshot($projected)
            );

            if ($changes === []) {
                return ['complaint' => $before, 'changed' => false];
            }

            DB::table('customer_complaints')->where('id', $id)->update([
                'complaint_date' => $data['complaintDate'],
                'client_id' => $clientId,
                'machine_type_id' => $data['machineTypeId'],
                'model' => $data['model'],
                'problem' => $data['problem'],
                'local_treatment' => $data['localTreatment'],
                'quality_alert' => $data['qualityAlert'],
            ]);
            $this->writeEdit('complaint', $id, (string) $record->code, $userId, $changes);
            QualityRevision::bump();

            return ['complaint' => $this->findComplaint($id) ?? [], 'changed' => true];
        });
    }

    public function deleteReport(int $id): ?string
    {
        return DB::transaction(function () use ($id): ?string {
            $record = DB::table('inspection_reports')->where('id', $id)->lockForUpdate()->first(['code']);
            if ($record === null) {
                return null;
            }
            DB::table('inspection_reports')->where('id', $id)->delete();
            QualityRevision::bump();

            return (string) $record->code;
        });
    }

    /** @return array{code: string, photos: list<string>}|null */
    public function deleteDispatch(int $id): ?array
    {
        return DB::transaction(function () use ($id): ?array {
            $record = DB::table('machine_dispatches')->where('id', $id)->lockForUpdate()->first(['code']);
            if ($record === null) {
                return null;
            }
            $photos = DB::table('machine_dispatch_photos')->where('machine_dispatch_id', $id)
                ->orderBy('position')->pluck('path')->map(static fn ($path): string => (string) $path)->all();
            DB::table('machine_dispatches')->where('id', $id)->delete();
            QualityRevision::bump();

            return ['code' => (string) $record->code, 'photos' => $photos];
        });
    }

    public function deleteComplaint(int $id): ?string
    {
        return DB::transaction(function () use ($id): ?string {
            $record = DB::table('customer_complaints')->where('id', $id)->lockForUpdate()->first(['code']);
            if ($record === null) {
                return null;
            }
            DB::table('customer_complaints')->where('id', $id)->delete();
            QualityRevision::bump();

            return (string) $record->code;
        });
    }

    /** @return array<string, mixed> */
    public function createReport(array $data, int $userId): array
    {
        $id = DB::transaction(function () use ($data, $userId): int {
            $sequence = ((int) DB::table('inspection_reports')->lockForUpdate()->max('sequence')) + 1;
            $id = DB::table('inspection_reports')->insertGetId([
                'code' => 'RAP'.str_pad((string) $sequence, 2, '0', STR_PAD_LEFT),
                'sequence' => $sequence,
                'report_date' => $data['reportDate'],
                'action_type' => $data['actionType'],
                'client_id' => $this->clientId($data['client']),
                'machine_type_id' => $data['machineTypeId'],
                'model' => $data['model'],
                'shed' => $data['shed'],
                'sector' => $data['sector'],
                'gate' => $data['gate'],
                'problem_type' => $data['problemType'],
                'quality_code_id' => $data['qualityCodeId'],
                'description' => $data['description'],
                'needs_checklist_update' => $data['needsChecklistUpdate'],
                'checklist_change' => $data['checklistChange'],
                'immediate_action' => $data['immediateAction'],
                'created_by_user_id' => $userId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->attachEmployees('inspection_report_employees', 'inspection_report_id', $id, $data['employeeIds']);
            QualityRevision::bump();

            return $id;
        });

        return $this->findReport($id) ?? [];
    }

    /** @param list<string> $photoPaths
     * @return array<string, mixed>
     */
    public function createDispatch(array $data, array $photoPaths, int $userId): array
    {
        $id = DB::transaction(function () use ($data, $photoPaths, $userId): int {
            $sequence = ((int) DB::table('machine_dispatches')->lockForUpdate()->max('sequence')) + 1;
            $id = DB::table('machine_dispatches')->insertGetId([
                'code' => 'RETIR'.$sequence,
                'sequence' => $sequence,
                'dispatch_date' => $data['dispatchDate'],
                'client_id' => $this->clientId($data['client']),
                'machine_type_id' => $data['machineTypeId'],
                'model' => $data['model'],
                'notes' => $data['notes'],
                'needs_form_update' => $data['needsFormUpdate'],
                'form_change' => $data['formChange'],
                'immediate_action' => $data['immediateAction'],
                'created_by_user_id' => $userId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->attachEmployees('machine_dispatch_employees', 'machine_dispatch_id', $id, $data['employeeIds']);
            DB::table('machine_dispatch_photos')->insert(array_map(
                static fn (string $path, int $position): array => [
                    'machine_dispatch_id' => $id,
                    'path' => $path,
                    'position' => $position + 1,
                    'created_at' => now(),
                ],
                array_values($photoPaths),
                array_keys(array_values($photoPaths))
            ));
            QualityRevision::bump();

            return $id;
        });

        return $this->findDispatch($id) ?? [];
    }

    /** @return array<string, mixed> */
    public function createComplaint(array $data, int $userId): array
    {
        $id = DB::transaction(function () use ($data, $userId): int {
            $sequence = ((int) DB::table('customer_complaints')->lockForUpdate()->max('sequence')) + 1;

            // source_key fica nulo de propósito: a chave é o casamento da
            // planilha (applyComplaints), então deixá-la vazia garante que uma
            // reimportação nunca sobrescreva o que foi lançado à mão.
            $id = DB::table('customer_complaints')->insertGetId([
                'code' => 'RSC'.str_pad((string) $sequence, 2, '0', STR_PAD_LEFT),
                'sequence' => $sequence,
                'complaint_date' => $data['complaintDate'],
                'client_id' => $this->clientId($data['client']),
                'machine_type_id' => $data['machineTypeId'],
                'model' => $data['model'],
                'problem' => $data['problem'],
                'local_treatment' => $data['localTreatment'],
                'quality_alert' => $data['qualityAlert'],
                'created_by_user_id' => $userId,
                'created_at' => now(),
            ]);
            QualityRevision::bump();

            return $id;
        });

        return $this->findComplaint($id) ?? [];
    }

    /** @return array{success: bool, message: string, data: array<string, mixed>} */
    public function validateReport(array $input, ?int $existingReportId = null): array
    {
        $fail = static fn (string $message): array => ['success' => false, 'message' => $message, 'data' => []];
        $date = $this->date($input['reportDate'] ?? null);
        if ($date === null) {
            return $fail('Informe uma data válida para o apontamento.');
        }
        $action = mb_strtoupper($this->text($input['actionType'] ?? '', 30));
        if (! in_array($action, self::ACTION_TYPES, true)) {
            return $fail('Selecione a identificação do relatório.');
        }
        $client = $this->text($input['client'] ?? '', 180);
        if ($client === '') {
            return $fail('Informe o cliente ou o lote.');
        }
        $machineTypeId = (int) ($input['machineTypeId'] ?? 0);
        if (! $this->recordExists('machine_types', $machineTypeId)) {
            return $fail('Selecione o tipo de máquina.');
        }
        $qualityCodeId = (int) ($input['qualityCodeId'] ?? 0);
        $currentQualityCodeId = $existingReportId === null ? null : DB::table('inspection_reports')
            ->where('id', $existingReportId)->value('quality_code_id');
        if (! $this->activeQualityCode($qualityCodeId)
            && ($existingReportId === null || $currentQualityCodeId === null
                || (int) $currentQualityCodeId !== $qualityCodeId)) {
            return $fail('Selecione o código do problema.');
        }
        $sector = mb_strtoupper($this->text($input['sector'] ?? '', 40));
        if (! in_array($sector, self::SECTORS, true)) {
            return $fail('Selecione a área da ação corretiva.');
        }
        $gate = mb_strtoupper($this->text($input['gate'] ?? '', 30));
        $currentGate = $existingReportId === null ? null : DB::table('inspection_reports')
            ->where('id', $existingReportId)->value('gate');
        if (! $this->activeGate($gate)
            && ($existingReportId === null || $currentGate === null
                || mb_strtoupper((string) $currentGate) !== $gate)) {
            return $fail('Selecione o gate da inspeção.');
        }
        $problemType = mb_strtoupper($this->text($input['problemType'] ?? '', 60));
        if (! in_array($problemType, self::PROBLEM_TYPES, true)) {
            return $fail('Selecione o local da não conformidade.');
        }
        $description = $this->text($input['description'] ?? '', 2000);
        if (mb_strlen($description) < 10) {
            return $fail('Descreva o ocorrido com pelo menos 10 caracteres.');
        }
        $employees = $this->employeeIds($input['employeeIds'] ?? []);
        if ($employees === []) {
            return $fail('Atribua ao menos um colaborador ao apontamento.');
        }
        foreach ($employees as $employeeId) {
            if (! $this->recordExists('employees', $employeeId)) {
                return $fail('Um dos colaboradores selecionados não existe mais.');
            }
        }
        $needsUpdate = filter_var($input['needsChecklistUpdate'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $change = $this->text($input['checklistChange'] ?? '', 1000);
        if ($needsUpdate && $change === '') {
            return $fail('Descreva a alteração necessária no checklist.');
        }

        return ['success' => true, 'message' => '', 'data' => [
            'reportDate' => $date,
            'actionType' => $action,
            'client' => $client,
            'machineTypeId' => $machineTypeId,
            'model' => $this->text($input['model'] ?? '', 80) ?: null,
            'shed' => mb_strtoupper($this->text($input['shed'] ?? '', 20)) ?: null,
            'sector' => $sector,
            'gate' => $gate,
            'problemType' => $problemType,
            'qualityCodeId' => $qualityCodeId,
            'description' => $description,
            'needsChecklistUpdate' => $needsUpdate,
            'checklistChange' => $needsUpdate ? $change : null,
            'immediateAction' => $this->text($input['immediateAction'] ?? '', 1000) ?: null,
            'employeeIds' => $employees,
        ]];
    }

    /** @return array{success: bool, message: string, data: array<string, mixed>} */
    public function validateDispatch(array $input): array
    {
        $fail = static fn (string $message): array => ['success' => false, 'message' => $message, 'data' => []];
        $date = $this->date($input['dispatchDate'] ?? null);
        if ($date === null) {
            return $fail('Informe uma data válida para a coleta.');
        }
        $client = $this->text($input['client'] ?? '', 180);
        if ($client === '') {
            return $fail('Informe o cliente da coleta.');
        }
        $machineTypeId = (int) ($input['machineTypeId'] ?? 0);
        if (! $this->recordExists('machine_types', $machineTypeId)) {
            return $fail('Selecione o tipo de máquina.');
        }
        $employees = $this->employeeIds($input['employeeIds'] ?? []);
        if ($employees === []) {
            return $fail('Informe o colaborador responsável pelo carregamento.');
        }
        foreach ($employees as $employeeId) {
            if (! $this->recordExists('employees', $employeeId)) {
                return $fail('Um dos colaboradores selecionados não existe mais.');
            }
        }
        $needsUpdate = filter_var($input['needsFormUpdate'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $change = $this->text($input['formChange'] ?? '', 1000);
        if ($needsUpdate && $change === '') {
            return $fail('Descreva a alteração necessária no formulário de coleta.');
        }

        return ['success' => true, 'message' => '', 'data' => [
            'dispatchDate' => $date,
            'client' => $client,
            'machineTypeId' => $machineTypeId,
            'model' => $this->text($input['model'] ?? '', 80) ?: null,
            'notes' => $this->text($input['notes'] ?? '', 2000) ?: null,
            'needsFormUpdate' => $needsUpdate,
            'formChange' => $needsUpdate ? $change : null,
            'immediateAction' => $this->text($input['immediateAction'] ?? '', 1000) ?: null,
            'employeeIds' => $employees,
        ]];
    }

    /** @return array{success: bool, message: string, data: array<string, mixed>} */
    public function validateComplaint(array $input): array
    {
        $fail = static fn (string $message): array => ['success' => false, 'message' => $message, 'data' => []];
        $date = $this->date($input['complaintDate'] ?? null);
        if ($date === null) {
            return $fail('Informe uma data válida para a reclamação.');
        }
        $client = $this->text($input['client'] ?? '', 180);
        if ($client === '') {
            return $fail('Informe o cliente que registrou a reclamação.');
        }
        $machineTypeId = (int) ($input['machineTypeId'] ?? 0);
        if (! $this->recordExists('machine_types', $machineTypeId)) {
            return $fail('Selecione o tipo de máquina.');
        }
        $problem = $this->text($input['problem'] ?? '', 2000);
        if (mb_strlen($problem) < 10) {
            return $fail('Descreva a ocorrência relatada com pelo menos 10 caracteres.');
        }

        return ['success' => true, 'message' => '', 'data' => [
            'complaintDate' => $date,
            'client' => $client,
            'machineTypeId' => $machineTypeId,
            'model' => $this->text($input['model'] ?? '', 80) ?: null,
            'problem' => $problem,
            'localTreatment' => $this->text($input['localTreatment'] ?? '', 2000) ?: null,
            'qualityAlert' => $this->text($input['qualityAlert'] ?? '', 180) ?: null,
        ]];
    }

    /** @param array<string, mixed> $filters */
    private function reportConditions(array $filters, array &$params): string
    {
        $conditions = [];
        $map = [
            'year' => ['YEAR(r.report_date)', 'year'],
            'month' => ['MONTH(r.report_date)', 'month'],
            'shed' => ['r.shed', 'shed'],
            'gate' => ['r.gate', 'gate'],
            'problemType' => ['r.problem_type', 'problem_type'],
            'model' => ['r.model', 'model'],
            'codeId' => ['r.quality_code_id', 'code_id'],
            'machineTypeId' => ['r.machine_type_id', 'machine_type_id'],
            'clientId' => ['r.client_id', 'client_id'],
        ];
        foreach ($map as $key => [$column, $parameter]) {
            if ($filters[$key] !== null) {
                $conditions[] = "{$column} = :{$parameter}";
                $params[$parameter] = $filters[$key];
            }
        }
        if ($filters['startDate'] !== null) {
            $conditions[] = 'r.report_date >= :start_date';
            $params['start_date'] = $filters['startDate'];
        }
        if ($filters['endDate'] !== null) {
            $conditions[] = 'r.report_date <= :end_date';
            $params['end_date'] = $filters['endDate'];
        }
        if ($filters['employeeId'] !== null) {
            $conditions[] = 'EXISTS (SELECT 1 FROM inspection_report_employees f'
                .' WHERE f.inspection_report_id = r.id AND f.employee_id = :employee_id)';
            $params['employee_id'] = $filters['employeeId'];
        }

        return $conditions === [] ? '' : ' WHERE '.implode(' AND ', $conditions);
    }

    private function dispatchConditions(array $filters, array &$params): string
    {
        $conditions = [];
        $map = [
            'year' => ['YEAR(d.dispatch_date)', 'year'],
            'month' => ['MONTH(d.dispatch_date)', 'month'],
            'model' => ['d.model', 'model'],
            'machineTypeId' => ['d.machine_type_id', 'machine_type_id'],
            'clientId' => ['d.client_id', 'client_id'],
        ];
        foreach ($map as $key => [$column, $parameter]) {
            if ($filters[$key] !== null) {
                $conditions[] = "{$column} = :{$parameter}";
                $params[$parameter] = $filters[$key];
            }
        }
        if ($filters['startDate'] !== null) {
            $conditions[] = 'd.dispatch_date >= :start_date';
            $params['start_date'] = $filters['startDate'];
        }
        if ($filters['endDate'] !== null) {
            $conditions[] = 'd.dispatch_date <= :end_date';
            $params['end_date'] = $filters['endDate'];
        }
        if ($filters['employeeId'] !== null) {
            $conditions[] = 'EXISTS (SELECT 1 FROM machine_dispatch_employees f'
                .' WHERE f.machine_dispatch_id = d.id AND f.employee_id = :employee_id)';
            $params['employee_id'] = $filters['employeeId'];
        }

        return $conditions === [] ? '' : ' WHERE '.implode(' AND ', $conditions);
    }

    private function complaintConditions(array $filters, array &$params): string
    {
        $conditions = [];
        $map = [
            'year' => ['YEAR(c.complaint_date)', 'year'],
            'month' => ['MONTH(c.complaint_date)', 'month'],
            'machineTypeId' => ['c.machine_type_id', 'machine_type_id'],
            'clientId' => ['c.client_id', 'client_id'],
        ];
        foreach ($map as $key => [$column, $parameter]) {
            if ($filters[$key] !== null) {
                $conditions[] = "{$column} = :{$parameter}";
                $params[$parameter] = $filters[$key];
            }
        }
        if ($filters['startDate'] !== null) {
            $conditions[] = 'c.complaint_date >= :start_date';
            $params['start_date'] = $filters['startDate'];
        }
        if ($filters['endDate'] !== null) {
            $conditions[] = 'c.complaint_date <= :end_date';
            $params['end_date'] = $filters['endDate'];
        }
        if (($filters['planStatus'] ?? null) !== null) {
            $exists = 'SELECT 1 FROM complaint_action_plans f WHERE f.customer_complaint_id = c.id';
            $conditions[] = match ($filters['planStatus']) {
                'none' => "NOT EXISTS ({$exists})",
                'closed' => "EXISTS ({$exists} AND f.closed_on IS NOT NULL)",
                'late' => "EXISTS ({$exists} AND f.closed_on IS NULL"
                    .' AND f.due_on IS NOT NULL AND f.due_on < :plan_today)',
                default => "EXISTS ({$exists} AND f.closed_on IS NULL)",
            };
            if ($filters['planStatus'] === 'late') {
                $params['plan_today'] = now()->toDateString();
            }
        }

        return $conditions === [] ? '' : ' WHERE '.implode(' AND ', $conditions);
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

    /** @return array<int, array{period: string, label: string, value: int}> */
    private function periodSeries(array $rows): array
    {
        return array_map(fn (array $row): array => [
            'period' => (string) $row['period'],
            'label' => $this->periodLabel((string) $row['period']),
            'value' => (int) $row['total'],
        ], $rows);
    }

    private function periodLabel(string $period): string
    {
        $months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        [$year, $month] = array_pad(explode('-', $period), 2, '1');

        return $months[max(1, min(12, (int) $month)) - 1].'/'.substr($year, -2);
    }

    /** @return array<int, array<string, mixed>> */
    private function castSeries(array $rows): array
    {
        return array_map(static function (array $row): array {
            $row['value'] = (int) $row['value'];

            return $row;
        }, $rows);
    }

    private function clientId(string $name): ?int
    {
        $name = trim(preg_replace('/\s+/', ' ', $name) ?? '');
        if ($name === '') {
            return null;
        }
        $normalized = mb_strtoupper((string) iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name), 'UTF-8');
        $existing = DB::table('clients')->where('normalized_name', $normalized)->value('id');

        return $existing ? (int) $existing : DB::table('clients')->insertGetId([
            'name' => $name, 'normalized_name' => $normalized, 'created_at' => now(),
        ]);
    }

    /** @param list<int> $employeeIds */
    private function attachEmployees(
        string $table,
        string $column,
        int $recordId,
        array $employeeIds
    ): void {
        $allowed = [
            'inspection_report_employees' => 'inspection_report_id',
            'machine_dispatch_employees' => 'machine_dispatch_id',
        ];
        if (($allowed[$table] ?? null) !== $column) {
            throw new InvalidArgumentException('Vínculo inválido.');
        }

        $rows = [];
        foreach (array_slice(array_values(array_unique($employeeIds)), 0, 3) as $position => $employeeId) {
            $rows[] = [$column => $recordId, 'employee_id' => $employeeId, 'position' => $position + 1];
        }
        if ($rows !== []) {
            DB::table($table)->insert($rows);
        }
    }

    /** @return list<array<string, mixed>> */
    private function editHistory(string $recordType, int $recordId): array
    {
        if (! in_array($recordType, ['report', 'dispatch', 'complaint'], true)) {
            throw new InvalidArgumentException('Tipo de registro inválido.');
        }

        return array_map(static function (array $row): array {
            $changes = is_string($row['changes'])
                ? json_decode($row['changes'], true)
                : $row['changes'];

            return [
                'id' => (int) $row['id'],
                'edited_at' => (string) $row['edited_at'],
                'edited_by' => $row['edited_by'] === null ? null : (string) $row['edited_by'],
                'edited_by_job_title' => $row['edited_by_job_title'] === null
                    ? null : (string) $row['edited_by_job_title'],
                'changes' => is_array($changes) ? $changes : [],
            ];
        }, $this->rows(
            'SELECT edit.id, edit.changes, edit.created_at AS edited_at,
                    COALESCE(edit.edited_by_name, editor.name) AS edited_by,
                    COALESCE(edit.edited_by_job_title, editor.job_title) AS edited_by_job_title
               FROM quality_record_edits edit
               LEFT JOIN users editor ON editor.id = edit.edited_by_user_id
              WHERE edit.record_type = :record_type AND edit.record_id = :record_id
              ORDER BY edit.created_at DESC, edit.id DESC',
            ['record_type' => $recordType, 'record_id' => $recordId]
        ));
    }

    /** @return array<string, mixed> */
    private function reportSnapshot(array $record): array
    {
        return [
            'reportDate' => (string) ($record['report_date'] ?? ''),
            'actionType' => $this->nullableString($record['action_type'] ?? null),
            'client' => $this->nullableString($record['client'] ?? null),
            'machineType' => $this->nullableString($record['machine_type'] ?? null),
            'model' => $this->nullableString($record['model'] ?? null),
            'shed' => $this->nullableString($record['shed'] ?? null),
            'sector' => $this->nullableString($record['sector'] ?? null),
            'gate' => $this->nullableString($record['gate'] ?? null),
            'problemType' => $this->nullableString($record['problem_type'] ?? null),
            'qualityCode' => $this->nullableString($record['quality_code'] ?? null),
            'description' => $this->nullableString($record['description'] ?? null),
            'needsChecklistUpdate' => (bool) ($record['needs_checklist_update'] ?? false),
            'checklistChange' => $this->nullableString($record['checklist_change'] ?? null),
            'immediateAction' => $this->nullableString($record['immediate_action'] ?? null),
            'employees' => array_values(array_map('strval', $record['employees'] ?? [])),
        ];
    }

    /** @return array<string, mixed> */
    private function dispatchSnapshot(array $record): array
    {
        return [
            'dispatchDate' => (string) ($record['dispatch_date'] ?? ''),
            'client' => $this->nullableString($record['client'] ?? null),
            'machineType' => $this->nullableString($record['machine_type'] ?? null),
            'model' => $this->nullableString($record['model'] ?? null),
            'notes' => $this->nullableString($record['notes'] ?? null),
            'needsFormUpdate' => (bool) ($record['needs_form_update'] ?? false),
            'formChange' => $this->nullableString($record['form_change'] ?? null),
            'immediateAction' => $this->nullableString($record['immediate_action'] ?? null),
            'employees' => array_values(array_map('strval', $record['employees'] ?? [])),
            'photos' => array_values(array_map('strval', $record['photos'] ?? [])),
        ];
    }

    /** @return array<string, mixed> */
    private function complaintSnapshot(array $record): array
    {
        return [
            'complaintDate' => (string) ($record['complaint_date'] ?? ''),
            'client' => $this->nullableString($record['client'] ?? null),
            'machineType' => $this->nullableString($record['machine_type'] ?? null),
            'model' => $this->nullableString($record['model'] ?? null),
            'problem' => $this->nullableString($record['problem'] ?? null),
            'localTreatment' => $this->nullableString($record['local_treatment'] ?? null),
            'qualityAlert' => $this->nullableString($record['quality_alert'] ?? null),
        ];
    }

    /**
     * @return array<string, array{before: mixed, after: mixed}>
     */
    private function changedFields(array $before, array $after): array
    {
        $changes = [];
        foreach ($after as $field => $value) {
            $previous = $before[$field] ?? null;
            if ($previous !== $value) {
                $changes[$field] = ['before' => $previous, 'after' => $value];
            }
        }

        return $changes;
    }

    /** @param array<string, array{before: mixed, after: mixed}> $changes */
    private function writeEdit(
        string $recordType,
        int $recordId,
        string $recordCode,
        int $userId,
        array $changes
    ): void {
        $editor = DB::table('users')->where('id', $userId)->first(['name', 'job_title']);

        DB::table('quality_record_edits')->insert([
            'record_type' => $recordType,
            'record_id' => $recordId,
            'record_code' => $recordCode,
            'edited_by_user_id' => $userId,
            'edited_by_name' => $editor?->name,
            'edited_by_job_title' => $editor?->job_title,
            'changes' => json_encode($changes, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function recordName(string $table, ?int $id): ?string
    {
        if (! in_array($table, ['clients', 'machine_types'], true) || $id === null || $id <= 0) {
            return null;
        }
        $name = DB::table($table)->where('id', $id)->value('name');

        return $name === null ? null : (string) $name;
    }

    private function qualityCode(int $id): ?string
    {
        $code = DB::table('quality_codes')->where('id', $id)->value('code');

        return $code === null ? null : (string) $code;
    }

    /** @param list<int> $employeeIds @return list<string> */
    private function employeeNames(array $employeeIds): array
    {
        $names = DB::table('employees')->whereIn('id', $employeeIds)->pluck('name', 'id');
        $ordered = [];
        foreach ($employeeIds as $employeeId) {
            if ($names->has($employeeId)) {
                $ordered[] = (string) $names->get($employeeId);
            }
        }

        return $ordered;
    }

    /** @param list<int> $employeeIds */
    private function replaceEmployeeIds(
        string $table,
        string $column,
        int $recordId,
        array $employeeIds
    ): void {
        $allowed = [
            'inspection_report_employees' => 'inspection_report_id',
            'machine_dispatch_employees' => 'machine_dispatch_id',
        ];
        if (($allowed[$table] ?? null) !== $column) {
            throw new InvalidArgumentException('Vínculo inválido.');
        }

        DB::table($table)->where($column, $recordId)->delete();
        $this->attachEmployees($table, $column, $recordId, $employeeIds);
    }

    private function nullableString(mixed $value): ?string
    {
        return $value === null || $value === '' ? null : (string) $value;
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

    /** @return list<int> */
    private function employeeIds(mixed $value): array
    {
        $ids = is_array($value) ? $value : [];
        $ids = array_filter(array_map('intval', $ids), static fn (int $id): bool => $id > 0);

        return array_slice(array_values(array_unique($ids)), 0, 3);
    }

    /**
     * Só catálogo ativo entra num RAP novo. Filtros e gráficos continuam
     * aceitando o desativado: ele segue vivo nos apontamentos já gravados.
     */
    private function activeGate(string $name): bool
    {
        return $name !== '' && DB::table('quality_gates')
            ->where('name', $name)->where('is_active', true)->exists();
    }

    private function activeQualityCode(int $id): bool
    {
        return $id > 0 && DB::table('quality_codes')
            ->where('id', $id)->where('is_active', true)->exists();
    }

    private function recordExists(string $table, int $id): bool
    {
        if (! in_array($table, ['machine_types', 'quality_codes', 'employees'], true)) {
            throw new InvalidArgumentException('Tabela inválida.');
        }

        return $id > 0 && DB::table($table)->where('id', $id)->exists();
    }
}
