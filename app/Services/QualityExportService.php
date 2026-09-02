<?php

declare(strict_types=1);

namespace App\Services;

use DateTimeImmutable;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

final class QualityExportService
{
    public const DATASETS = ['reports', 'dispatches', 'complaints', 'plans', 'catalogs'];

    /**
     * @param  list<string>  $datasets
     * @param  array<string, mixed>  $filters
     */
    public function export(array $datasets, array $filters): string
    {
        $datasets = array_values(array_unique(array_intersect($datasets, self::DATASETS)));
        if ($datasets === []) {
            throw new InvalidArgumentException('Selecione pelo menos um conjunto de dados para exportar.');
        }

        $workbook = new Spreadsheet;
        $workbook->removeSheetByIndex(0);

        foreach ($datasets as $dataset) {
            match ($dataset) {
                'reports' => $this->writeSheet($workbook, 'RAPs', [
                    'Codigo', 'Data', 'Acao', 'Cliente', 'Maquina', 'Modelo', 'Barracao',
                    'Setor', 'Gate', 'Tipo de problema', 'Codigo qualidade', 'Descricao do codigo',
                    'Descricao', 'Acao imediata', 'Atualizar checklist', 'Alteracao checklist',
                    'Colaboradores', 'Criado por', 'Criado em',
                ], $this->reports($filters)),
                'dispatches' => $this->writeSheet($workbook, 'Coletas', [
                    'Codigo', 'Data', 'Cliente', 'Maquina', 'Modelo', 'Observacoes',
                    'Atualizar formulario', 'Alteracao formulario', 'Acao imediata',
                    'Colaboradores', 'Fotos', 'Criado por', 'Criado em',
                ], $this->dispatches($filters)),
                'complaints' => $this->writeSheet($workbook, 'Satisfacao', [
                    'Codigo', 'Data', 'Cliente', 'Maquina', 'Modelo', 'Problema',
                    'Tratativa local', 'Alerta da qualidade', 'Plano', 'Status do plano',
                    'Criado por', 'Criado em',
                ], $this->complaints($filters)),
                'plans' => $this->writeSheet($workbook, 'Planos', [
                    'Codigo', 'Abertura', 'Prazo', 'Fechamento', 'Status', 'Reclamacao',
                    'Mes sem reclamacao', 'Observacao do mes', 'Cliente', 'Maquina',
                    'Modelo', 'Responsavel', 'Causa raiz', 'Acao',
                    'Andamentos', 'Criado por', 'Criado em',
                ], $this->plans($filters)),
                'catalogs' => $this->catalogs($workbook),
                default => null,
            };
        }

        $workbook->setActiveSheetIndex(0);
        $path = tempnam(sys_get_temp_dir(), 'quality-export-').'.xlsx';
        (new Xlsx($workbook))->save($path);
        $workbook->disconnectWorksheets();

        return $path;
    }

    /** @return list<array<int, mixed>> */
    private function reports(array $filters): array
    {
        $params = [];
        $where = $this->reportConditions($filters, $params);
        $employees = $this->groupConcat('e.name', 're.position');

        return $this->rows(
            "SELECT r.code, r.report_date, r.action_type, cl.name AS client, t.name AS machine_type,
                    r.model, r.shed, r.sector, r.gate, r.problem_type, q.code AS quality_code,
                    q.description AS quality_code_description, r.description, r.immediate_action,
                    r.needs_checklist_update, r.checklist_change, report_employees.employees,
                    u.name AS created_by, r.created_at
               FROM inspection_reports r
               LEFT JOIN clients cl ON cl.id = r.client_id
               LEFT JOIN machine_types t ON t.id = r.machine_type_id
               LEFT JOIN quality_codes q ON q.id = r.quality_code_id
               LEFT JOIN users u ON u.id = r.created_by_user_id
               LEFT JOIN (
                    SELECT re.inspection_report_id,
                           {$employees} AS employees
                      FROM inspection_report_employees re
                      JOIN employees e ON e.id = re.employee_id
                     GROUP BY re.inspection_report_id
               ) report_employees ON report_employees.inspection_report_id = r.id
               {$where} ORDER BY r.report_date DESC, r.sequence DESC",
            $params
        );
    }

    /** @return list<array<int, mixed>> */
    private function dispatches(array $filters): array
    {
        $params = [];
        $where = $this->dispatchConditions($filters, $params);
        $employees = $this->groupConcat('e.name', 'de.position');

        return $this->rows(
            "SELECT d.code, d.dispatch_date, cl.name AS client, t.name AS machine_type,
                    d.model, d.notes, d.needs_form_update, d.form_change, d.immediate_action,
                    dispatch_employees.employees,
                    (SELECT COUNT(*) FROM machine_dispatch_photos p WHERE p.machine_dispatch_id = d.id) AS photos,
                    u.name AS created_by, d.created_at
               FROM machine_dispatches d
               LEFT JOIN clients cl ON cl.id = d.client_id
               LEFT JOIN machine_types t ON t.id = d.machine_type_id
               LEFT JOIN users u ON u.id = d.created_by_user_id
               LEFT JOIN (
                    SELECT de.machine_dispatch_id,
                           {$employees} AS employees
                      FROM machine_dispatch_employees de
                      JOIN employees e ON e.id = de.employee_id
                     GROUP BY de.machine_dispatch_id
               ) dispatch_employees ON dispatch_employees.machine_dispatch_id = d.id
               {$where} ORDER BY d.dispatch_date DESC, d.sequence DESC",
            $params
        );
    }

    /** @return list<array<int, mixed>> */
    private function complaints(array $filters): array
    {
        $params = [];
        $where = $this->complaintConditions($filters, $params);

        return $this->rows(
            "SELECT c.code, c.complaint_date, cl.name AS client, t.name AS machine_type,
                    c.model, c.problem, c.local_treatment, c.quality_alert, p.code AS plan_code,
                    CASE
                        WHEN p.id IS NULL THEN 'Sem plano'
                        WHEN p.closed_on IS NOT NULL THEN 'Concluido'
                        WHEN p.due_on IS NOT NULL AND p.due_on < :today THEN 'Atrasado'
                        ELSE 'Em aberto'
                    END AS plan_status,
                    u.name AS created_by, c.created_at
               FROM customer_complaints c
               LEFT JOIN clients cl ON cl.id = c.client_id
               LEFT JOIN machine_types t ON t.id = c.machine_type_id
               LEFT JOIN complaint_action_plans p ON p.customer_complaint_id = c.id
               LEFT JOIN users u ON u.id = c.created_by_user_id
               {$where} ORDER BY c.complaint_date DESC, c.sequence DESC",
            ['today' => now()->toDateString()] + $params
        );
    }

    /** @return list<array<int, mixed>> */
    private function plans(array $filters): array
    {
        $params = [];
        $where = $this->planConditions($filters, $params);
        $entries = $this->groupConcat($this->concat(["n.entry_date", "' - '", 'n.note']), 'n.entry_date, n.id');

        return $this->rows(
            "SELECT p.code, p.opened_on, p.due_on, p.closed_on,
                    CASE
                        WHEN p.closed_on IS NOT NULL THEN 'Concluido'
                        WHEN p.due_on IS NOT NULL AND p.due_on < :today THEN 'Atrasado'
                        ELSE 'Em aberto'
                    END AS status,
                    c.code AS complaint_code, p.no_complaint_month, p.no_complaint_note,
                    cl.name AS client, t.name AS machine_type,
                    c.model, COALESCE(e.name, u.name) AS employee, p.root_cause, p.action,
                    entries.notes, u.name AS created_by, p.created_at
               FROM complaint_action_plans p
               LEFT JOIN customer_complaints c ON c.id = p.customer_complaint_id
               LEFT JOIN clients cl ON cl.id = c.client_id
               LEFT JOIN machine_types t ON t.id = c.machine_type_id
               LEFT JOIN employees e ON e.id = p.employee_id
               LEFT JOIN users u ON u.id = p.created_by_user_id
               LEFT JOIN (
                    SELECT n.complaint_action_plan_id,
                           {$entries} AS notes
                      FROM complaint_action_plan_entries n
                     GROUP BY n.complaint_action_plan_id
               ) entries ON entries.complaint_action_plan_id = p.id
               {$where} ORDER BY (p.closed_on IS NULL) DESC, p.opened_on DESC, p.sequence DESC",
            ['today' => now()->toDateString()] + $params
        );
    }

    private function catalogs(Spreadsheet $workbook): void
    {
        $this->writeSheet($workbook, 'Catalogos - Codigos', ['Codigo', 'Descricao', 'Ativo'], $this->rows(
            'SELECT code, description, is_active FROM quality_codes ORDER BY position, code'
        ));
        $this->writeSheet($workbook, 'Catalogos - Colaboradores', ['Nome', 'Ativo'], $this->rows(
            'SELECT name, is_active FROM employees ORDER BY name'
        ));
        $this->writeSheet($workbook, 'Catalogos - Produtos', ['Maquina', 'Modelo'], $this->rows(
            'SELECT t.name AS machine_type, m.name AS model
               FROM machine_models m JOIN machine_types t ON t.id = m.machine_type_id
              ORDER BY t.name, m.name'
        ));
        $this->writeSheet($workbook, 'Catalogos - Clientes', ['Cliente'], $this->rows(
            'SELECT name FROM clients ORDER BY name'
        ));
    }

    /** @param list<string> $headers @param list<array<int, mixed>> $rows */
    private function writeSheet(Spreadsheet $workbook, string $title, array $headers, array $rows): Worksheet
    {
        $sheet = $workbook->createSheet();
        $sheet->setTitle(mb_substr($title, 0, 31));
        $sheet->fromArray($headers, null, 'A1');
        if ($rows !== []) {
            $sheet->fromArray($rows, null, 'A2');
        }

        $highestColumn = $sheet->getHighestColumn();
        $sheet->getStyle("A1:{$highestColumn}1")->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle("A1:{$highestColumn}1")->getFill()
            ->setFillType(Fill::FILL_SOLID)
            ->getStartColor()->setRGB('E50019');
        $sheet->freezePane('A2');
        $sheet->setAutoFilter($sheet->calculateWorksheetDimension());

        foreach (range('A', $highestColumn) as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        return $sheet;
    }

    /** @return list<array<int, mixed>> */
    private function rows(string $sql, array $params = []): array
    {
        return array_map(static fn (object $row): array => array_values((array) $row), DB::select($sql, $params));
    }

    private function groupConcat(string $expression, string $orderBy): string
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            return "GROUP_CONCAT({$expression}, ' | ')";
        }

        return "GROUP_CONCAT({$expression} ORDER BY {$orderBy} SEPARATOR ' | ')";
    }

    /** @param list<string> $parts */
    private function concat(array $parts): string
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            return implode(' || ', $parts);
        }

        return 'CONCAT('.implode(', ', $parts).')';
    }

    /** @param array<string, mixed> $filters */
    private function reportConditions(array $filters, array &$params): string
    {
        return $this->conditions('r', 'report_date', $filters, $params, [
            'shed' => 'r.shed',
            'gate' => 'r.gate',
            'problemType' => 'r.problem_type',
            'model' => 'r.model',
            'codeId' => 'r.quality_code_id',
            'machineTypeId' => 'r.machine_type_id',
            'clientId' => 'r.client_id',
        ], 'inspection_report_employees', 'inspection_report_id');
    }

    /** @param array<string, mixed> $filters */
    private function dispatchConditions(array $filters, array &$params): string
    {
        return $this->conditions('d', 'dispatch_date', $filters, $params, [
            'model' => 'd.model',
            'machineTypeId' => 'd.machine_type_id',
            'clientId' => 'd.client_id',
        ], 'machine_dispatch_employees', 'machine_dispatch_id');
    }

    /** @param array<string, mixed> $filters */
    private function complaintConditions(array $filters, array &$params): string
    {
        return $this->conditions('c', 'complaint_date', $filters, $params, [
            'model' => 'c.model',
            'machineTypeId' => 'c.machine_type_id',
            'clientId' => 'c.client_id',
        ]);
    }

    /** @param array<string, mixed> $filters */
    private function planConditions(array $filters, array &$params): string
    {
        return $this->conditions('p', 'opened_on', $filters, $params, [
            'model' => 'c.model',
            'machineTypeId' => 'c.machine_type_id',
            'clientId' => 'c.client_id',
            'employeeId' => 'p.employee_id',
        ]);
    }

    /**
     * @param array<string, mixed> $filters
     * @param array<string, string> $map
     */
    private function conditions(
        string $alias,
        string $dateColumn,
        array $filters,
        array &$params,
        array $map,
        ?string $employeePivot = null,
        ?string $employeeColumn = null
    ): string {
        $conditions = [];

        foreach ($map as $key => $column) {
            if (($filters[$key] ?? null) !== null) {
                $parameter = strtolower((string) preg_replace('/([a-z])([A-Z])/', '$1_$2', $key));
                $conditions[] = "{$column} = :{$parameter}";
                $params[$parameter] = $filters[$key];
            }
        }

        if (($filters['year'] ?? null) !== null) {
            $conditions[] = "{$alias}.{$dateColumn} >= :year_start AND {$alias}.{$dateColumn} <= :year_end";
            $params['year_start'] = sprintf('%04d-01-01', $filters['year']);
            $params['year_end'] = sprintf('%04d-12-31', $filters['year']);
        }
        if (($filters['month'] ?? null) !== null) {
            $month = max(1, min(12, (int) $filters['month']));
            if (($filters['year'] ?? null) !== null) {
                $first = new DateTimeImmutable(sprintf('%04d-%02d-01', $filters['year'], $month));
                $conditions[] = "{$alias}.{$dateColumn} >= :month_start AND {$alias}.{$dateColumn} <= :month_end";
                $params['month_start'] = $first->format('Y-m-d');
                $params['month_end'] = $first->modify('last day of this month')->format('Y-m-d');
            } else {
                $conditions[] = "SUBSTR({$alias}.{$dateColumn}, 6, 2) = :month_text";
                $params['month_text'] = sprintf('%02d', $month);
            }
        }
        if (($filters['startDate'] ?? null) !== null) {
            $conditions[] = "{$alias}.{$dateColumn} >= :start_date";
            $params['start_date'] = $filters['startDate'];
        }
        if (($filters['endDate'] ?? null) !== null) {
            $conditions[] = "{$alias}.{$dateColumn} <= :end_date";
            $params['end_date'] = $filters['endDate'];
        }
        if (($filters['employeeId'] ?? null) !== null && $employeePivot !== null && $employeeColumn !== null) {
            $conditions[] = "EXISTS (SELECT 1 FROM {$employeePivot} f WHERE f.{$employeeColumn} = {$alias}.id AND f.employee_id = :employee_id)";
            $params['employee_id'] = $filters['employeeId'];
        }

        return $conditions === [] ? '' : ' WHERE '.implode(' AND ', $conditions);
    }
}
