<?php

declare(strict_types=1);

namespace App\Services;

use DateTimeImmutable;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class QualityService
{
    public const ACTION_TYPES = ['CORREÇÃO', 'RNC', 'CORRETIVA'];

    public const SECTORS = ['PRODUÇÃO', 'QUALIDADE', 'EXPEDIÇÃO'];

    public const GATES = ['GATE 1', 'GATE 2', 'GATE 3', 'SAÍDA DE MÁQUINAS'];

    public const PROBLEM_TYPES = [
        'MECÂNICO', 'ELÉTRICO', 'AVARIA/ESTÉTICA', 'FINALIZAÇÃO DA MÁQUINA',
        'TESTES DE FUNCIONAMENTO', 'PARAMETRIZAÇÃO', 'SEPARAÇÃO DE ITENS', 'PALETIZAÇÃO',
    ];

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

        return [
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

        return [
            'codes' => $this->rows('SELECT id, code, description FROM quality_codes ORDER BY position'),
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
            'gates' => self::GATES,
            'sectors' => self::SECTORS,
            'problemTypes' => self::PROBLEM_TYPES,
            'actionTypes' => self::ACTION_TYPES,
        ];
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
                "SELECT c.id, c.complaint_date, cl.name AS client, t.name AS machine_type, c.model, c.problem
                   FROM customer_complaints c
                   LEFT JOIN clients cl ON cl.id = c.client_id
                   LEFT JOIN machine_types t ON t.id = c.machine_type_id
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
        $report['employees'] = array_column($this->rows(
            'SELECT e.name FROM inspection_report_employees re
               JOIN employees e ON e.id = re.employee_id
              WHERE re.inspection_report_id = :id ORDER BY re.position',
            ['id' => $id]
        ), 'name');

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
        $dispatch['employees'] = array_column($this->rows(
            'SELECT e.name FROM machine_dispatch_employees de
               JOIN employees e ON e.id = de.employee_id
              WHERE de.machine_dispatch_id = :id ORDER BY de.position',
            ['id' => $id]
        ), 'name');
        $dispatch['photos'] = array_column($this->rows(
            'SELECT path FROM machine_dispatch_photos WHERE machine_dispatch_id = :id ORDER BY position',
            ['id' => $id]
        ), 'path');

        return $dispatch;
    }

    public function deleteReport(int $id): ?string
    {
        return DB::transaction(function () use ($id): ?string {
            $record = DB::table('inspection_reports')->where('id', $id)->lockForUpdate()->first(['code']);
            if ($record === null) {
                return null;
            }
            DB::table('inspection_reports')->where('id', $id)->delete();

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

            return ['code' => (string) $record->code, 'photos' => $photos];
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

            return $id;
        });

        return $this->findDispatch($id) ?? [];
    }

    /** @return array{success: bool, message: string, data: array<string, mixed>} */
    public function validateReport(array $input): array
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
        if (! $this->recordExists('quality_codes', $qualityCodeId)) {
            return $fail('Selecione o código do problema.');
        }
        $sector = mb_strtoupper($this->text($input['sector'] ?? '', 40));
        if (! in_array($sector, self::SECTORS, true)) {
            return $fail('Selecione a área da ação corretiva.');
        }
        $gate = mb_strtoupper($this->text($input['gate'] ?? '', 30));
        if (! in_array($gate, self::GATES, true)) {
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

    private function recordExists(string $table, int $id): bool
    {
        if (! in_array($table, ['machine_types', 'quality_codes', 'employees'], true)) {
            throw new InvalidArgumentException('Tabela inválida.');
        }

        return $id > 0 && DB::table($table)->where('id', $id)->exists();
    }
}
