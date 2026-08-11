<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';

/**
 * Consultas do setor de qualidade: indicadores do painel, listagens e gravação
 * de RAPs e coletas. Os endpoints em api/quality apenas validam entrada e
 * serializam o que estas funções devolvem.
 *
 * As medidas do Power BI original não puderam ser lidas (o modelo do .pbix está
 * comprimido em XPress9), então as fórmulas estão redefinidas aqui de forma explícita.
 */

/** Valores aceitos nos campos de escolha, usados na validação e nos selects da tela. */
const QUALITY_ACTION_TYPES = ['CORREÇÃO', 'RNC', 'CORRETIVA'];
const QUALITY_SECTORS = ['PRODUÇÃO', 'QUALIDADE', 'EXPEDIÇÃO'];
const QUALITY_GATES = ['GATE 1', 'GATE 2', 'GATE 3', 'SAÍDA DE MÁQUINAS'];
const QUALITY_PROBLEM_TYPES = [
    'MECÂNICO',
    'ELÉTRICO',
    'AVARIA/ESTÉTICA',
    'FINALIZAÇÃO DA MÁQUINA',
    'TESTES DE FUNCIONAMENTO',
    'PARAMETRIZAÇÃO',
    'SEPARAÇÃO DE ITENS',
    'PALETIZAÇÃO',
];

/** Normaliza os filtros da query string, descartando o que não for reconhecido. */
function qualityFilters(array $input): array
{
    $integer = static function (mixed $value): ?int {
        return is_numeric($value) && (int) $value > 0 ? (int) $value : null;
    };

    $string = static function (mixed $value): ?string {
        $value = is_string($value) ? trim($value) : '';
        return $value === '' ? null : mb_substr($value, 0, 80);
    };

    $month = $integer($input['month'] ?? null);

    return [
        'year' => $integer($input['year'] ?? null),
        'month' => $month !== null && $month <= 12 ? $month : null,
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

/**
 * Condições aplicáveis aos RAPs. Os parâmetros saem por referência para que cada
 * consulta receba exatamente os valores que usa.
 */
function reportConditions(array $filters, array &$params): string
{
    $conditions = [];

    if ($filters['year'] !== null) {
        $conditions[] = 'YEAR(r.report_date) = :year';
        $params['year'] = $filters['year'];
    }
    if ($filters['month'] !== null) {
        $conditions[] = 'MONTH(r.report_date) = :month';
        $params['month'] = $filters['month'];
    }
    if ($filters['shed'] !== null) {
        $conditions[] = 'r.shed = :shed';
        $params['shed'] = $filters['shed'];
    }
    if ($filters['gate'] !== null) {
        $conditions[] = 'r.gate = :gate';
        $params['gate'] = $filters['gate'];
    }
    if ($filters['problemType'] !== null) {
        $conditions[] = 'r.problem_type = :problem_type';
        $params['problem_type'] = $filters['problemType'];
    }
    if ($filters['model'] !== null) {
        $conditions[] = 'r.model = :model';
        $params['model'] = $filters['model'];
    }
    if ($filters['codeId'] !== null) {
        $conditions[] = 'r.quality_code_id = :code_id';
        $params['code_id'] = $filters['codeId'];
    }
    if ($filters['machineTypeId'] !== null) {
        $conditions[] = 'r.machine_type_id = :machine_type_id';
        $params['machine_type_id'] = $filters['machineTypeId'];
    }
    if ($filters['clientId'] !== null) {
        $conditions[] = 'r.client_id = :client_id';
        $params['client_id'] = $filters['clientId'];
    }
    if ($filters['employeeId'] !== null) {
        // EXISTS evita duplicar o RAP quando ele tem mais de um colaborador.
        $conditions[] = 'EXISTS (SELECT 1 FROM inspection_report_employees f'
            . ' WHERE f.inspection_report_id = r.id AND f.employee_id = :employee_id)';
        $params['employee_id'] = $filters['employeeId'];
    }

    return $conditions === [] ? '' : ' WHERE ' . implode(' AND ', $conditions);
}

/** Condições das coletas: só os filtros que existem nessa tabela. */
function dispatchConditions(array $filters, array &$params): string
{
    $conditions = [];

    if ($filters['year'] !== null) {
        $conditions[] = 'YEAR(d.dispatch_date) = :year';
        $params['year'] = $filters['year'];
    }
    if ($filters['month'] !== null) {
        $conditions[] = 'MONTH(d.dispatch_date) = :month';
        $params['month'] = $filters['month'];
    }
    if ($filters['model'] !== null) {
        $conditions[] = 'd.model = :model';
        $params['model'] = $filters['model'];
    }
    if ($filters['machineTypeId'] !== null) {
        $conditions[] = 'd.machine_type_id = :machine_type_id';
        $params['machine_type_id'] = $filters['machineTypeId'];
    }
    if ($filters['clientId'] !== null) {
        $conditions[] = 'd.client_id = :client_id';
        $params['client_id'] = $filters['clientId'];
    }
    if ($filters['employeeId'] !== null) {
        $conditions[] = 'EXISTS (SELECT 1 FROM machine_dispatch_employees f'
            . ' WHERE f.machine_dispatch_id = d.id AND f.employee_id = :employee_id)';
        $params['employee_id'] = $filters['employeeId'];
    }

    return $conditions === [] ? '' : ' WHERE ' . implode(' AND ', $conditions);
}

/** Mesma lógica das coletas aplicada às reclamações, que só têm data e cliente. */
function complaintConditions(array $filters, array &$params): string
{
    $conditions = [];

    if ($filters['year'] !== null) {
        $conditions[] = 'YEAR(c.complaint_date) = :year';
        $params['year'] = $filters['year'];
    }
    if ($filters['month'] !== null) {
        $conditions[] = 'MONTH(c.complaint_date) = :month';
        $params['month'] = $filters['month'];
    }
    if ($filters['machineTypeId'] !== null) {
        $conditions[] = 'c.machine_type_id = :machine_type_id';
        $params['machine_type_id'] = $filters['machineTypeId'];
    }
    if ($filters['clientId'] !== null) {
        $conditions[] = 'c.client_id = :client_id';
        $params['client_id'] = $filters['clientId'];
    }

    return $conditions === [] ? '' : ' WHERE ' . implode(' AND ', $conditions);
}

function queryRows(string $sql, array $params = []): array
{
    $statement = database()->prepare($sql);
    $statement->execute($params);

    return $statement->fetchAll();
}

function queryValue(string $sql, array $params = []): mixed
{
    $statement = database()->prepare($sql);
    $statement->execute($params);

    return $statement->fetchColumn();
}

/** Rótulo curto de período (2026-03 vira "mar/26") para os eixos dos gráficos. */
function periodLabel(string $period): string
{
    static $months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    [$year, $month] = array_pad(explode('-', $period), 2, '1');
    $index = max(1, min(12, (int) $month)) - 1;

    return $months[$index] . '/' . substr($year, -2);
}

/** Converte linhas period/total na série usada pelo frontend. */
function periodSeries(array $rows): array
{
    return array_map(static fn (array $row): array => [
        'period' => (string) $row['period'],
        'label' => periodLabel((string) $row['period']),
        'value' => (int) $row['total'],
    ], $rows);
}

/** Listas que alimentam os filtros do painel e os selects dos formulários. */
function qualityOptions(): array
{
    $models = queryRows(
        'SELECT m.id, m.name, m.machine_type_id, t.name AS machine_type
         FROM machine_models m JOIN machine_types t ON t.id = m.machine_type_id
         ORDER BY t.name, m.name'
    );

    return [
        'codes' => queryRows('SELECT id, code, description FROM quality_codes ORDER BY position'),
        'employees' => queryRows('SELECT id, name FROM employees WHERE is_active = 1 ORDER BY name'),
        'machineTypes' => queryRows('SELECT id, name FROM machine_types ORDER BY name'),
        'machineModels' => array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'machineTypeId' => (int) $row['machine_type_id'],
            'machineType' => (string) $row['machine_type'],
        ], $models),
        'clients' => queryRows('SELECT id, name FROM clients ORDER BY name'),
        // Barracões e anos saem dos dados: a planilha não tem uma lista fixa deles.
        'sheds' => array_column(
            queryRows("SELECT DISTINCT shed FROM inspection_reports WHERE shed IS NOT NULL AND shed <> '' ORDER BY shed"),
            'shed'
        ),
        'years' => array_map('intval', array_column(
            queryRows(
                'SELECT DISTINCT YEAR(report_date) AS year FROM inspection_reports
                 UNION SELECT DISTINCT YEAR(dispatch_date) FROM machine_dispatches ORDER BY year DESC'
            ),
            'year'
        )),
        'gates' => QUALITY_GATES,
        'sectors' => QUALITY_SECTORS,
        'problemTypes' => QUALITY_PROBLEM_TYPES,
        'actionTypes' => QUALITY_ACTION_TYPES,
    ];
}

/** Todos os agregados das seis seções do painel em uma única resposta. */
function qualityDashboard(array $filters): array
{
    $reportParams = [];
    $reportWhere = reportConditions($filters, $reportParams);
    $dispatchParams = [];
    $dispatchWhere = dispatchConditions($filters, $dispatchParams);
    $complaintParams = [];
    $complaintWhere = complaintConditions($filters, $complaintParams);

    $totalReports = (int) queryValue("SELECT COUNT(*) FROM inspection_reports r{$reportWhere}", $reportParams);
    $totalDispatches = (int) queryValue("SELECT COUNT(*) FROM machine_dispatches d{$dispatchWhere}", $dispatchParams);
    $totalComplaints = (int) queryValue("SELECT COUNT(*) FROM customer_complaints c{$complaintWhere}", $complaintParams);

    $reportsByPeriod = periodSeries(queryRows(
        "SELECT DATE_FORMAT(r.report_date, '%Y-%m') AS period, COUNT(*) AS total
         FROM inspection_reports r{$reportWhere} GROUP BY period ORDER BY period",
        $reportParams
    ));

    // "RAPs do mês" tomando o mês mais recente com registro: a base vai até julho,
    // então travar no mês do relógio mostraria zero e pareceria defeito.
    $latestPeriod = $reportsByPeriod === [] ? null : end($reportsByPeriod);

    $byGate = queryRows(
        "SELECT DATE_FORMAT(r.report_date, '%Y-%m') AS period, COALESCE(r.gate, '—') AS gate, COUNT(*) AS total
         FROM inspection_reports r{$reportWhere} GROUP BY period, gate ORDER BY period, gate",
        $reportParams
    );

    return [
        'cards' => [
            'totalReports' => $totalReports,
            'latestPeriodReports' => $latestPeriod['value'] ?? 0,
            'latestPeriodLabel' => $latestPeriod['label'] ?? '—',
            'clients' => (int) queryValue(
                "SELECT COUNT(DISTINCT r.client_id) FROM inspection_reports r{$reportWhere}",
                $reportParams
            ),
            'models' => (int) queryValue(
                "SELECT COUNT(DISTINCT r.model) FROM inspection_reports r{$reportWhere}",
                $reportParams
            ),
            'machineTypes' => (int) queryValue(
                "SELECT COUNT(DISTINCT r.machine_type_id) FROM inspection_reports r{$reportWhere}",
                $reportParams
            ),
            'totalDispatches' => $totalDispatches,
            'totalComplaints' => $totalComplaints,
            // Taxa de satisfação = coletas sem reclamação sobre o total de coletas.
            'satisfactionRate' => $totalDispatches > 0
                ? round((1 - $totalComplaints / $totalDispatches) * 100, 1)
                : null,
            'complaintRate' => $totalDispatches > 0
                ? round($totalComplaints / $totalDispatches * 100, 1)
                : null,
            'highlightMachine' => queryValue(
                "SELECT t.name FROM machine_dispatches d JOIN machine_types t ON t.id = d.machine_type_id
                 {$dispatchWhere} GROUP BY t.id ORDER BY COUNT(*) DESC LIMIT 1",
                $dispatchParams
            ) ?: null,
            'highlightModel' => queryValue(
                "SELECT d.model FROM machine_dispatches d
                 {$dispatchWhere} " . ($dispatchWhere === '' ? 'WHERE' : 'AND') . " d.model IS NOT NULL
                 GROUP BY d.model ORDER BY COUNT(*) DESC LIMIT 1",
                $dispatchParams
            ) ?: null,
        ],
        'reportsByPeriod' => $reportsByPeriod,
        'reportsByProblemType' => castSeries(queryRows(
            "SELECT COALESCE(r.problem_type, '—') AS label, COUNT(*) AS value
             FROM inspection_reports r{$reportWhere} GROUP BY label ORDER BY value DESC",
            $reportParams
        )),
        'reportsByCode' => castSeries(queryRows(
            "SELECT c.code AS label, c.description, COUNT(r.id) AS value
             FROM quality_codes c JOIN inspection_reports r ON r.quality_code_id = c.id
             {$reportWhere} GROUP BY c.id ORDER BY value DESC",
            $reportParams
        )),
        'reportsByShed' => castSeries(queryRows(
            "SELECT COALESCE(r.shed, '—') AS label, COUNT(*) AS value
             FROM inspection_reports r{$reportWhere} GROUP BY label ORDER BY value DESC",
            $reportParams
        )),
        'reportsByGate' => array_map(static fn (array $row): array => [
            'period' => (string) $row['period'],
            'label' => periodLabel((string) $row['period']),
            'gate' => (string) $row['gate'],
            'value' => (int) $row['total'],
        ], $byGate),
        // A linha de produto vai junto: no gráfico o modelo é só um código, e o
        // tooltip precisa dizer de que máquina ele é.
        'reportsByModel' => castSeries(queryRows(
            "SELECT COALESCE(r.model, '—') AS label, MAX(CONCAT('Linha ', t.name)) AS description, COUNT(*) AS value
             FROM inspection_reports r
             LEFT JOIN machine_types t ON t.id = r.machine_type_id
             {$reportWhere} GROUP BY label ORDER BY value DESC LIMIT 15",
            $reportParams
        )),
        'reportsByMachineType' => castSeries(queryRows(
            "SELECT t.name AS label, COUNT(r.id) AS value
             FROM machine_types t JOIN inspection_reports r ON r.machine_type_id = t.id
             {$reportWhere} GROUP BY t.id ORDER BY value DESC",
            $reportParams
        )),
        // Participações, não RAPs: um apontamento com três pessoas conta três vezes.
        'reportsByEmployee' => castSeries(queryRows(
            "SELECT e.name AS label, COUNT(*) AS value
             FROM inspection_report_employees re
             JOIN employees e ON e.id = re.employee_id
             JOIN inspection_reports r ON r.id = re.inspection_report_id
             {$reportWhere} GROUP BY e.id ORDER BY value DESC LIMIT 20",
            $reportParams
        )),
        'dispatchesByPeriod' => periodSeries(queryRows(
            "SELECT DATE_FORMAT(d.dispatch_date, '%Y-%m') AS period, COUNT(*) AS total
             FROM machine_dispatches d{$dispatchWhere} GROUP BY period ORDER BY period",
            $dispatchParams
        )),
        'dispatchesByMachineType' => castSeries(queryRows(
            "SELECT t.name AS label, COUNT(d.id) AS value
             FROM machine_types t JOIN machine_dispatches d ON d.machine_type_id = t.id
             {$dispatchWhere} GROUP BY t.id ORDER BY value DESC",
            $dispatchParams
        )),
        'dispatchesByModel' => castSeries(queryRows(
            "SELECT COALESCE(d.model, '—') AS label, MAX(CONCAT('Linha ', t.name)) AS description, COUNT(*) AS value
             FROM machine_dispatches d
             LEFT JOIN machine_types t ON t.id = d.machine_type_id
             {$dispatchWhere} GROUP BY label ORDER BY value DESC LIMIT 15",
            $dispatchParams
        )),
        'complaintsByPeriod' => periodSeries(queryRows(
            "SELECT DATE_FORMAT(c.complaint_date, '%Y-%m') AS period, COUNT(*) AS total
             FROM customer_complaints c{$complaintWhere} GROUP BY period ORDER BY period",
            $complaintParams
        )),
        'complaints' => queryRows(
            "SELECT c.id, c.complaint_date, cl.name AS client, t.name AS machine_type, c.model, c.problem
             FROM customer_complaints c
             LEFT JOIN clients cl ON cl.id = c.client_id
             LEFT JOIN machine_types t ON t.id = c.machine_type_id
             {$complaintWhere} ORDER BY c.complaint_date DESC LIMIT 50",
            $complaintParams
        ),
    ];
}

/** Converte os inteiros que o PDO devolve como texto, para o gráfico não receber string. */
function castSeries(array $rows): array
{
    return array_map(static function (array $row): array {
        $row['value'] = (int) $row['value'];
        return $row;
    }, $rows);
}

/** Lista paginada de RAPs, com os mesmos filtros do painel. */
function listInspectionReports(array $filters, int $page = 1, int $perPage = 25): array
{
    $params = [];
    $where = reportConditions($filters, $params);
    $page = max(1, $page);
    $perPage = max(1, min($perPage, 100));
    $offset = ($page - 1) * $perPage;

    $total = (int) queryValue("SELECT COUNT(*) FROM inspection_reports r{$where}", $params);

    $rows = queryRows(
        "SELECT r.id, r.code, r.report_date, r.action_type, r.shed, r.sector, r.gate,
                r.problem_type, r.model, r.description, r.immediate_action,
                r.needs_checklist_update, cl.name AS client, t.name AS machine_type,
                q.code AS quality_code, q.description AS quality_code_description,
                GROUP_CONCAT(e.name ORDER BY re.position SEPARATOR ' | ') AS employees
         FROM inspection_reports r
         LEFT JOIN clients cl ON cl.id = r.client_id
         LEFT JOIN machine_types t ON t.id = r.machine_type_id
         LEFT JOIN quality_codes q ON q.id = r.quality_code_id
         LEFT JOIN inspection_report_employees re ON re.inspection_report_id = r.id
         LEFT JOIN employees e ON e.id = re.employee_id
         {$where}
         GROUP BY r.id ORDER BY r.report_date DESC, r.sequence DESC
         LIMIT {$perPage} OFFSET {$offset}",
        $params
    );

    return ['total' => $total, 'page' => $page, 'perPage' => $perPage, 'items' => $rows];
}

/** Um RAP completo, usado na tela de impressão. */
function findInspectionReport(int $id): ?array
{
    $rows = queryRows(
        "SELECT r.*, cl.name AS client, t.name AS machine_type,
                q.code AS quality_code, q.description AS quality_code_description,
                u.name AS created_by
         FROM inspection_reports r
         LEFT JOIN clients cl ON cl.id = r.client_id
         LEFT JOIN machine_types t ON t.id = r.machine_type_id
         LEFT JOIN quality_codes q ON q.id = r.quality_code_id
         LEFT JOIN users u ON u.id = r.created_by_user_id
         WHERE r.id = :id",
        ['id' => $id]
    );

    if ($rows === []) {
        return null;
    }

    $report = $rows[0];
    $report['employees'] = array_column(queryRows(
        'SELECT e.name FROM inspection_report_employees re
         JOIN employees e ON e.id = re.employee_id
         WHERE re.inspection_report_id = :id ORDER BY re.position',
        ['id' => $id]
    ), 'name');

    return $report;
}

/** Lista paginada de coletas. */
function listMachineDispatches(array $filters, int $page = 1, int $perPage = 25): array
{
    $params = [];
    $where = dispatchConditions($filters, $params);
    $page = max(1, $page);
    $perPage = max(1, min($perPage, 100));
    $offset = ($page - 1) * $perPage;

    $total = (int) queryValue("SELECT COUNT(*) FROM machine_dispatches d{$where}", $params);

    $rows = queryRows(
        "SELECT d.id, d.code, d.dispatch_date, d.model, d.notes, cl.name AS client,
                t.name AS machine_type,
                (SELECT COUNT(*) FROM machine_dispatch_photos p WHERE p.machine_dispatch_id = d.id) AS photos
         FROM machine_dispatches d
         LEFT JOIN clients cl ON cl.id = d.client_id
         LEFT JOIN machine_types t ON t.id = d.machine_type_id
         {$where}
         ORDER BY d.dispatch_date DESC, d.sequence DESC
         LIMIT {$perPage} OFFSET {$offset}",
        $params
    );

    return ['total' => $total, 'page' => $page, 'perPage' => $perPage, 'items' => $rows];
}

/** Uma coleta completa, com fotos e colaboradores, para a tela de impressão. */
function findMachineDispatch(int $id): ?array
{
    $rows = queryRows(
        "SELECT d.*, cl.name AS client, t.name AS machine_type, u.name AS created_by
         FROM machine_dispatches d
         LEFT JOIN clients cl ON cl.id = d.client_id
         LEFT JOIN machine_types t ON t.id = d.machine_type_id
         LEFT JOIN users u ON u.id = d.created_by_user_id
         WHERE d.id = :id",
        ['id' => $id]
    );

    if ($rows === []) {
        return null;
    }

    $dispatch = $rows[0];
    $dispatch['employees'] = array_column(queryRows(
        'SELECT e.name FROM machine_dispatch_employees de
         JOIN employees e ON e.id = de.employee_id
         WHERE de.machine_dispatch_id = :id ORDER BY de.position',
        ['id' => $id]
    ), 'name');
    $dispatch['photos'] = array_column(queryRows(
        'SELECT path FROM machine_dispatch_photos WHERE machine_dispatch_id = :id ORDER BY position',
        ['id' => $id]
    ), 'path');

    return $dispatch;
}

/** Exclui um RAP e seus vínculos de colaboradores, removidos por cascata. */
function deleteInspectionReport(int $id): ?string
{
    $connection = database();
    $connection->beginTransaction();

    try {
        $query = $connection->prepare(
            'SELECT code FROM inspection_reports WHERE id = :id FOR UPDATE'
        );
        $query->execute(['id' => $id]);
        $code = $query->fetchColumn();

        if ($code === false) {
            $connection->rollBack();
            return null;
        }

        $connection->prepare('DELETE FROM inspection_reports WHERE id = :id')
            ->execute(['id' => $id]);
        $connection->commit();

        return (string) $code;
    } catch (Throwable $error) {
        if ($connection->inTransaction()) {
            $connection->rollBack();
        }
        throw $error;
    }
}

/** Exclui um RETIR e devolve as fotos que devem ser removidas do disco. */
function deleteMachineDispatch(int $id): ?array
{
    $connection = database();
    $connection->beginTransaction();

    try {
        $query = $connection->prepare(
            'SELECT code FROM machine_dispatches WHERE id = :id FOR UPDATE'
        );
        $query->execute(['id' => $id]);
        $code = $query->fetchColumn();

        if ($code === false) {
            $connection->rollBack();
            return null;
        }

        $photoQuery = $connection->prepare(
            'SELECT path FROM machine_dispatch_photos WHERE machine_dispatch_id = :id ORDER BY position'
        );
        $photoQuery->execute(['id' => $id]);
        $photos = array_map('strval', $photoQuery->fetchAll(PDO::FETCH_COLUMN));

        $connection->prepare('DELETE FROM machine_dispatches WHERE id = :id')
            ->execute(['id' => $id]);
        $connection->commit();

        return ['code' => (string) $code, 'photos' => $photos];
    } catch (Throwable $error) {
        if ($connection->inTransaction()) {
            $connection->rollBack();
        }
        throw $error;
    }
}

/** Localiza ou cria o cliente pelo nome digitado, reaproveitando a chave normalizada. */
function clientIdForName(string $name): ?int
{
    $name = trim(preg_replace('/\s+/', ' ', $name) ?? '');

    if ($name === '') {
        return null;
    }

    // A mesma normalização do importador: sem acento e sem caixa.
    $normalized = mb_strtoupper(
        (string) iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name),
        'UTF-8'
    );

    $existing = queryValue(
        'SELECT id FROM clients WHERE normalized_name = :normalized LIMIT 1',
        ['normalized' => $normalized]
    );

    if ($existing) {
        return (int) $existing;
    }

    $insert = database()->prepare(
        'INSERT INTO clients (name, normalized_name) VALUES (:name, :normalized)'
    );
    $insert->execute(['name' => $name, 'normalized' => $normalized]);

    return (int) database()->lastInsertId();
}

/** Próximo número da sequência, já dentro da transação que grava o registro. */
function nextSequence(string $table): int
{
    $allowed = ['inspection_reports', 'machine_dispatches'];

    if (!in_array($table, $allowed, true)) {
        throw new InvalidArgumentException('Tabela inválida.');
    }

    return (int) queryValue("SELECT COALESCE(MAX(sequence), 0) + 1 FROM {$table}") ?: 1;
}

/** Guarda um RAP novo e devolve o registro gravado. */
function createInspectionReport(array $data, int $userId): array
{
    $connection = database();
    $connection->beginTransaction();

    try {
        $sequence = nextSequence('inspection_reports');
        $code = 'RAP' . str_pad((string) $sequence, 2, '0', STR_PAD_LEFT);

        $statement = $connection->prepare(
            'INSERT INTO inspection_reports
                (code, sequence, report_date, action_type, client_id, machine_type_id, model,
                 shed, sector, gate, problem_type, quality_code_id, description,
                 needs_checklist_update, checklist_change, immediate_action, created_by_user_id)
             VALUES
                (:code, :sequence, :report_date, :action_type, :client_id, :machine_type_id, :model,
                 :shed, :sector, :gate, :problem_type, :quality_code_id, :description,
                 :needs_checklist_update, :checklist_change, :immediate_action, :created_by_user_id)'
        );
        $statement->execute([
            'code' => $code,
            'sequence' => $sequence,
            'report_date' => $data['reportDate'],
            'action_type' => $data['actionType'],
            'client_id' => clientIdForName((string) $data['client']),
            'machine_type_id' => $data['machineTypeId'],
            'model' => $data['model'],
            'shed' => $data['shed'],
            'sector' => $data['sector'],
            'gate' => $data['gate'],
            'problem_type' => $data['problemType'],
            'quality_code_id' => $data['qualityCodeId'],
            'description' => $data['description'],
            'needs_checklist_update' => $data['needsChecklistUpdate'] ? 1 : 0,
            'checklist_change' => $data['checklistChange'],
            'immediate_action' => $data['immediateAction'],
            'created_by_user_id' => $userId,
        ]);

        $reportId = (int) $connection->lastInsertId();
        attachEmployees('inspection_report_employees', 'inspection_report_id', $reportId, $data['employeeIds']);

        $connection->commit();
    } catch (Throwable $error) {
        $connection->rollBack();
        throw $error;
    }

    return findInspectionReport($reportId) ?? [];
}

/** Guarda uma coleta nova. As fotos já foram salvas em disco pelo endpoint. */
function createMachineDispatch(array $data, array $photoPaths, int $userId): array
{
    $connection = database();
    $connection->beginTransaction();

    try {
        $sequence = nextSequence('machine_dispatches');
        $code = 'RETIR' . $sequence;

        $statement = $connection->prepare(
            'INSERT INTO machine_dispatches
                (code, sequence, dispatch_date, client_id, machine_type_id, model, notes,
                 needs_form_update, form_change, immediate_action, created_by_user_id)
             VALUES
                (:code, :sequence, :dispatch_date, :client_id, :machine_type_id, :model, :notes,
                 :needs_form_update, :form_change, :immediate_action, :created_by_user_id)'
        );
        $statement->execute([
            'code' => $code,
            'sequence' => $sequence,
            'dispatch_date' => $data['dispatchDate'],
            'client_id' => clientIdForName((string) $data['client']),
            'machine_type_id' => $data['machineTypeId'],
            'model' => $data['model'],
            'notes' => $data['notes'],
            'needs_form_update' => $data['needsFormUpdate'] ? 1 : 0,
            'form_change' => $data['formChange'],
            'immediate_action' => $data['immediateAction'],
            'created_by_user_id' => $userId,
        ]);

        $dispatchId = (int) $connection->lastInsertId();
        attachEmployees('machine_dispatch_employees', 'machine_dispatch_id', $dispatchId, $data['employeeIds']);

        $photoStatement = $connection->prepare(
            'INSERT INTO machine_dispatch_photos (machine_dispatch_id, path, position)
             VALUES (:dispatch_id, :path, :position)'
        );
        foreach (array_values($photoPaths) as $position => $path) {
            $photoStatement->execute([
                'dispatch_id' => $dispatchId,
                'path' => $path,
                'position' => $position + 1,
            ]);
        }

        $connection->commit();
    } catch (Throwable $error) {
        $connection->rollBack();
        throw $error;
    }

    return findMachineDispatch($dispatchId) ?? [];
}

/** Vincula até três colaboradores ao registro recém-criado, sem repetir a mesma pessoa. */
function attachEmployees(string $table, string $column, int $recordId, array $employeeIds): void
{
    $allowed = [
        'inspection_report_employees' => 'inspection_report_id',
        'machine_dispatch_employees' => 'machine_dispatch_id',
    ];

    if (($allowed[$table] ?? null) !== $column) {
        throw new InvalidArgumentException('Vínculo inválido.');
    }

    $unique = array_slice(array_values(array_unique(array_filter(array_map('intval', $employeeIds)))), 0, 3);
    $statement = database()->prepare(
        "INSERT INTO {$table} ({$column}, employee_id, position) VALUES (:record_id, :employee_id, :position)"
    );

    foreach ($unique as $position => $employeeId) {
        $statement->execute([
            'record_id' => $recordId,
            'employee_id' => $employeeId,
            'position' => $position + 1,
        ]);
    }
}

/** Texto limpo e limitado, usado pelas validações dos formulários. */
function qualityText(mixed $value, int $limit): string
{
    $value = is_string($value) ? trim(preg_replace('/\s+/', ' ', $value) ?? '') : '';

    return mb_substr($value, 0, $limit);
}

/** Confere se a data veio no formato do input date e existe no calendário. */
function qualityDate(mixed $value): ?string
{
    $value = is_string($value) ? trim($value) : '';
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

    return $parsed && $parsed->format('Y-m-d') === $value ? $value : null;
}

/** Devolve os ids de colaborador válidos: no máximo três, sem repetição. */
function qualityEmployeeIds(mixed $value): array
{
    $ids = is_array($value) ? $value : [];
    $ids = array_filter(array_map('intval', $ids), static fn (int $id): bool => $id > 0);

    return array_slice(array_values(array_unique($ids)), 0, 3);
}

/** Confere a existência de um registro nas tabelas de apoio referenciadas pelos formulários. */
function recordExists(string $table, int $id): bool
{
    $allowed = ['machine_types', 'quality_codes', 'employees'];

    if (!in_array($table, $allowed, true)) {
        throw new InvalidArgumentException('Tabela inválida.');
    }

    return (bool) queryValue("SELECT 1 FROM {$table} WHERE id = :id LIMIT 1", ['id' => $id]);
}

/**
 * Valida o formulário de RAP conforme a seção 3.1 do processo de qualidade.
 * Devolve ['success' => bool, 'message' => string, 'data' => array].
 */
function validateInspectionReport(array $input): array
{
    $fail = static fn (string $message): array => ['success' => false, 'message' => $message, 'data' => []];

    $reportDate = qualityDate($input['reportDate'] ?? null);
    if ($reportDate === null) {
        return $fail('Informe uma data válida para o apontamento.');
    }

    $actionType = mb_strtoupper(qualityText($input['actionType'] ?? '', 30));
    if (!in_array($actionType, QUALITY_ACTION_TYPES, true)) {
        return $fail('Selecione a identificação do relatório.');
    }

    $client = qualityText($input['client'] ?? '', 180);
    if ($client === '') {
        return $fail('Informe o cliente ou o lote.');
    }

    $machineTypeId = (int) ($input['machineTypeId'] ?? 0);
    if ($machineTypeId <= 0 || !recordExists('machine_types', $machineTypeId)) {
        return $fail('Selecione o tipo de máquina.');
    }

    $qualityCodeId = (int) ($input['qualityCodeId'] ?? 0);
    if ($qualityCodeId <= 0 || !recordExists('quality_codes', $qualityCodeId)) {
        return $fail('Selecione o código do problema.');
    }

    $sector = mb_strtoupper(qualityText($input['sector'] ?? '', 40));
    if (!in_array($sector, QUALITY_SECTORS, true)) {
        return $fail('Selecione a área da ação corretiva.');
    }

    $gate = mb_strtoupper(qualityText($input['gate'] ?? '', 30));
    if (!in_array($gate, QUALITY_GATES, true)) {
        return $fail('Selecione o gate da inspeção.');
    }

    $problemType = mb_strtoupper(qualityText($input['problemType'] ?? '', 60));
    if (!in_array($problemType, QUALITY_PROBLEM_TYPES, true)) {
        return $fail('Selecione o local da não conformidade.');
    }

    $description = qualityText($input['description'] ?? '', 2000);
    if (mb_strlen($description) < 10) {
        return $fail('Descreva o ocorrido com pelo menos 10 caracteres.');
    }

    $employeeIds = qualityEmployeeIds($input['employeeIds'] ?? []);
    if ($employeeIds === []) {
        return $fail('Atribua ao menos um colaborador ao apontamento.');
    }

    foreach ($employeeIds as $employeeId) {
        if (!recordExists('employees', $employeeId)) {
            return $fail('Um dos colaboradores selecionados não existe mais.');
        }
    }

    $needsChecklistUpdate = filter_var($input['needsChecklistUpdate'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $checklistChange = qualityText($input['checklistChange'] ?? '', 1000);

    // A abrangência só é aceita sem descrição quando o apontamento não muda o checklist.
    if ($needsChecklistUpdate && $checklistChange === '') {
        return $fail('Descreva a alteração necessária no checklist.');
    }

    return [
        'success' => true,
        'message' => '',
        'data' => [
            'reportDate' => $reportDate,
            'actionType' => $actionType,
            'client' => $client,
            'machineTypeId' => $machineTypeId,
            'model' => qualityText($input['model'] ?? '', 80) ?: null,
            'shed' => mb_strtoupper(qualityText($input['shed'] ?? '', 20)) ?: null,
            'sector' => $sector,
            'gate' => $gate,
            'problemType' => $problemType,
            'qualityCodeId' => $qualityCodeId,
            'description' => $description,
            'needsChecklistUpdate' => $needsChecklistUpdate,
            'checklistChange' => $needsChecklistUpdate ? $checklistChange : null,
            'immediateAction' => qualityText($input['immediateAction'] ?? '', 1000) ?: null,
            'employeeIds' => $employeeIds,
        ],
    ];
}

/** Valida o formulário de Produto Coletado conforme a seção 5.2 do processo. */
function validateMachineDispatch(array $input): array
{
    $fail = static fn (string $message): array => ['success' => false, 'message' => $message, 'data' => []];

    $dispatchDate = qualityDate($input['dispatchDate'] ?? null);
    if ($dispatchDate === null) {
        return $fail('Informe uma data válida para a coleta.');
    }

    $client = qualityText($input['client'] ?? '', 180);
    if ($client === '') {
        return $fail('Informe o cliente da coleta.');
    }

    $machineTypeId = (int) ($input['machineTypeId'] ?? 0);
    if ($machineTypeId <= 0 || !recordExists('machine_types', $machineTypeId)) {
        return $fail('Selecione o tipo de máquina.');
    }

    $employeeIds = qualityEmployeeIds($input['employeeIds'] ?? []);
    if ($employeeIds === []) {
        return $fail('Informe o colaborador responsável pelo carregamento.');
    }

    foreach ($employeeIds as $employeeId) {
        if (!recordExists('employees', $employeeId)) {
            return $fail('Um dos colaboradores selecionados não existe mais.');
        }
    }

    $needsFormUpdate = filter_var($input['needsFormUpdate'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $formChange = qualityText($input['formChange'] ?? '', 1000);

    if ($needsFormUpdate && $formChange === '') {
        return $fail('Descreva a alteração necessária no formulário de coleta.');
    }

    return [
        'success' => true,
        'message' => '',
        'data' => [
            'dispatchDate' => $dispatchDate,
            'client' => $client,
            'machineTypeId' => $machineTypeId,
            'model' => qualityText($input['model'] ?? '', 80) ?: null,
            'notes' => qualityText($input['notes'] ?? '', 2000) ?: null,
            'needsFormUpdate' => $needsFormUpdate,
            'formChange' => $needsFormUpdate ? $formChange : null,
            'immediateAction' => qualityText($input['immediateAction'] ?? '', 1000) ?: null,
            'employeeIds' => $employeeIds,
        ],
    ];
}
