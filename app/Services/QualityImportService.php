<?php

declare(strict_types=1);

namespace App\Services;

use App\Support\QualityRevision;
use DateTimeImmutable;
use DateTimeInterface;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use RuntimeException;
use Throwable;

final class QualityImportService
{
    private const SHEETS = [
        'REGISTRO DE INSPEÇÃO',
        'SAÍDA DE MÁQUINAS',
        'REGISTRO DE RECLAMAÇÕES CLIENTE',
        'REGISTRO DE PROBLEMAS START',
        'CADASTRO DE COLABORADORES',
        'PRODUTOS',
        'TABELA DE CÓDIGOS',
    ];

    /** @return array<string, mixed> */
    public function preview(UploadedFile $file, int $userId): array
    {
        $extension = strtolower((string) $file->getClientOriginalExtension());
        if (! in_array($extension, ['xlsx', 'xlsm'], true)) {
            throw new RuntimeException('Envie uma planilha Excel no formato .xlsx ou .xlsm.');
        }
        if (! $file->isValid() || $file->getSize() === false || $file->getSize() > 15 * 1024 * 1024) {
            throw new RuntimeException('A planilha não pôde ser enviada ou ultrapassa o limite de 15 MB.');
        }

        $path = $file->getRealPath();
        if ($path === false) {
            throw new RuntimeException('Não foi possível ler o arquivo enviado.');
        }

        $payload = $this->parse($path);
        $summary = $this->summarize($payload);
        $token = (string) Str::uuid();

        DB::table('quality_imports')->insert([
            'token' => $token,
            'user_id' => $userId,
            'original_name' => mb_substr($file->getClientOriginalName(), 0, 255),
            'file_hash' => hash_file('sha256', $path),
            'status' => 'pending',
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            'summary' => json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            'errors' => json_encode($payload['errors'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            'expires_at' => now()->addMinutes(30),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return ['token' => $token, 'summary' => $summary, 'errors' => $payload['errors']];
    }

    /** @return array<string, mixed> */
    public function confirm(string $token, int $userId): array
    {
        return DB::transaction(function () use ($token, $userId): array {
            $batch = DB::table('quality_imports')->where('token', $token)->lockForUpdate()->first();
            if ($batch === null || (int) $batch->user_id !== $userId) {
                throw new RuntimeException('Prévia de importação não encontrada.');
            }
            if ($batch->status !== 'pending') {
                throw new RuntimeException('Esta importação já foi concluída.');
            }
            if (now()->greaterThan($batch->expires_at)) {
                throw new RuntimeException('A prévia expirou. Selecione a planilha novamente.');
            }

            /** @var array<string, mixed> $payload */
            $payload = json_decode((string) $batch->payload, true, 512, JSON_THROW_ON_ERROR);
            $this->applyCatalogs($payload);
            $this->applyReports($payload['reports'], $userId);
            $this->applyDispatches($payload['dispatches'], $userId);
            $this->applyComplaints($payload['complaints']);
            $this->applyStartupProblems($payload['startupProblems']);

            DB::table('quality_imports')->where('id', $batch->id)->update([
                'status' => 'completed',
                'payload' => '{}',
                'confirmed_at' => now(),
                'updated_at' => now(),
            ]);
            QualityRevision::bump();

            return [
                'message' => 'Planilha importada com sucesso.',
                'summary' => json_decode((string) $batch->summary, true, 512, JSON_THROW_ON_ERROR),
            ];
        });
    }

    /** @return list<array<string, mixed>> */
    public function history(): array
    {
        return DB::table('quality_imports as i')
            ->leftJoin('users as u', 'u.id', '=', 'i.user_id')
            ->orderByDesc('i.id')->limit(10)
            ->get(['i.original_name', 'i.file_hash', 'i.status', 'i.summary', 'i.created_at', 'i.confirmed_at', 'u.name as user_name'])
            ->map(static fn (object $row): array => [
                'fileName' => (string) $row->original_name,
                'fileHash' => (string) $row->file_hash,
                'status' => (string) $row->status,
                'summary' => json_decode((string) $row->summary, true),
                'createdAt' => (string) $row->created_at,
                'confirmedAt' => $row->confirmed_at === null ? null : (string) $row->confirmed_at,
                'userName' => $row->user_name === null ? 'Usuário removido' : (string) $row->user_name,
            ])->all();
    }

    /** @return array<string, mixed> */
    private function parse(string $path): array
    {
        try {
            $reader = IOFactory::createReaderForFile($path);
            $reader->setReadDataOnly(true);
            $reader->setLoadSheetsOnly(self::SHEETS);
            $workbook = $reader->load($path);
        } catch (Throwable $error) {
            throw new RuntimeException('A planilha está corrompida ou não pôde ser reconhecida.', 0, $error);
        }

        try {
            foreach (self::SHEETS as $sheetName) {
                if ($workbook->getSheetByName($sheetName) === null) {
                    throw new RuntimeException("A aba obrigatória {$sheetName} não foi encontrada.");
                }
            }

            $errors = [];
            $reports = $this->parseReports($this->rows($workbook->getSheetByName('REGISTRO DE INSPEÇÃO'), 5, 'S'), $errors);
            $dispatches = $this->parseDispatches($this->rows($workbook->getSheetByName('SAÍDA DE MÁQUINAS'), 4, 'P'), $errors);
            $complaints = $this->parseComplaints($this->rows($workbook->getSheetByName('REGISTRO DE RECLAMAÇÕES CLIENTE'), 4, 'J'));
            $startup = $this->parseStartup($this->rows($workbook->getSheetByName('REGISTRO DE PROBLEMAS START'), 4, 'J'));

            $employees = [];
            foreach ($this->rows($workbook->getSheetByName('CADASTRO DE COLABORADORES'), 4, 'B') as $row) {
                $this->addUnique($employees, $this->text($row[1] ?? null));
            }
            foreach (array_merge($reports, $dispatches) as $record) {
                foreach ($record['employees'] as $employee) {
                    $this->addUnique($employees, $employee);
                }
            }

            $codes = [];
            foreach ($this->rows($workbook->getSheetByName('TABELA DE CÓDIGOS'), 2, 'C') as $position => $row) {
                $code = mb_strtoupper($this->text($row[1] ?? null));
                if ($code !== '') {
                    $codes[$this->normalize($code)] = ['code' => $code, 'description' => $this->text($row[2] ?? null), 'position' => $position + 1];
                }
            }

            $products = [];
            $productRows = $this->rows($workbook->getSheetByName('PRODUTOS'), 3, 'I');
            $header = array_shift($productRows) ?? [];
            for ($column = 1; $column <= 8; $column++) {
                $type = mb_strtoupper($this->text($header[$column] ?? null));
                if ($type === '') {
                    continue;
                }
                $models = [];
                foreach ($productRows as $row) {
                    $this->addUnique($models, $this->text($row[$column] ?? null));
                }
                $products[] = ['type' => $type, 'models' => array_values($models)];
            }

            return [
                'reports' => array_values($reports),
                'dispatches' => array_values($dispatches),
                'complaints' => array_values($complaints),
                'startupProblems' => array_values($startup),
                'employees' => array_values($employees),
                'codes' => array_values($codes),
                'products' => $products,
                'errors' => array_slice($errors, 0, 100),
            ];
        } finally {
            $workbook->disconnectWorksheets();
        }
    }

    /** @return list<array<int, mixed>> */
    private function rows(?object $sheet, int $startRow, string $lastColumn): array
    {
        if ($sheet === null) {
            return [];
        }
        $lastRow = $sheet->getHighestDataRow();
        if ($lastRow < $startRow) {
            return [];
        }

        return $sheet->rangeToArray("A{$startRow}:{$lastColumn}{$lastRow}", null, false, false, false);
    }

    /** @param list<array<int, mixed>> $rows @param list<string> $errors */
    private function parseReports(array $rows, array &$errors): array
    {
        $records = [];
        foreach ($rows as $offset => $row) {
            $code = mb_strtoupper($this->text($row[1] ?? null));
            $date = $this->date($row[2] ?? null);
            if ($code === '' && $date === null) {
                continue;
            }
            if ($code === '' || $date === null) {
                $errors[] = 'REGISTRO DE INSPEÇÃO, linha '.($offset + 5).': código ou data inválidos.';

                continue;
            }
            if (isset($records[$code])) {
                $errors[] = "REGISTRO DE INSPEÇÃO: o código {$code} está repetido na planilha.";

                continue;
            }
            $records[$code] = [
                'code' => $code, 'sequence' => $this->sequence($code), 'date' => $date,
                'actionType' => mb_strtoupper($this->text($row[4] ?? null)),
                'client' => $this->text($row[5] ?? null), 'model' => $this->text($row[6] ?? null),
                'machineType' => mb_strtoupper($this->text($row[7] ?? null)),
                'shed' => mb_strtoupper($this->text($row[8] ?? null)),
                'sector' => mb_strtoupper($this->text($row[9] ?? null)),
                'gate' => mb_strtoupper($this->text($row[10] ?? null)),
                'problemType' => mb_strtoupper($this->text($row[11] ?? null)),
                'qualityCode' => mb_strtoupper($this->text($row[12] ?? null)),
                'description' => $this->text($row[13] ?? null),
                'employees' => $this->nonEmpty([$row[14] ?? null, $row[15] ?? null, $row[16] ?? null]),
                'needsUpdate' => str_starts_with($this->normalize($this->text($row[17] ?? null)), 'SIM'),
                'immediateAction' => $this->text($row[18] ?? null),
            ];
        }

        return $records;
    }

    /** @param list<array<int, mixed>> $rows @param list<string> $errors */
    private function parseDispatches(array $rows, array &$errors): array
    {
        $records = [];
        foreach ($rows as $offset => $row) {
            $code = mb_strtoupper($this->text($row[1] ?? null));
            $date = $this->date($row[3] ?? null);
            if ($code === '' && $date === null) {
                continue;
            }
            if ($code === '' || $date === null) {
                $errors[] = 'SAÍDA DE MÁQUINAS, linha '.($offset + 4).': código ou data inválidos.';

                continue;
            }
            if (isset($records[$code])) {
                $errors[] = "SAÍDA DE MÁQUINAS: o código {$code} está repetido na planilha.";

                continue;
            }
            $records[$code] = [
                'code' => $code, 'sequence' => $this->sequence($code), 'date' => $date,
                'client' => $this->text($row[5] ?? null),
                'machineType' => mb_strtoupper($this->text($row[6] ?? null)),
                'model' => $this->text($row[7] ?? null), 'notes' => $this->text($row[8] ?? null),
                'employees' => $this->nonEmpty([$row[9] ?? null, $row[10] ?? null, $row[11] ?? null]),
                'needsUpdate' => str_starts_with($this->normalize($this->text($row[12] ?? null)), 'SIM'),
                'immediateAction' => $this->text($row[13] ?? null),
            ];
        }

        return $records;
    }

    /** @param list<array<int, mixed>> $rows */
    private function parseComplaints(array $rows): array
    {
        $records = [];
        foreach ($rows as $row) {
            $date = $this->date($row[1] ?? null);
            if ($date === null) {
                continue;
            }
            $record = [
                'date' => $date, 'client' => $this->text($row[3] ?? null), 'model' => $this->text($row[4] ?? null),
                'machineType' => mb_strtoupper($this->text($row[5] ?? null)), 'problem' => $this->text($row[6] ?? null),
                'localTreatment' => $this->text($row[7] ?? null), 'qualityAlert' => $this->text($row[8] ?? null),
                'signatures' => $this->text($row[9] ?? null),
            ];
            $record['sourceKey'] = $this->sourceKey($record);
            $records[$record['sourceKey']] = $record;
        }

        return $records;
    }

    /** @param list<array<int, mixed>> $rows */
    private function parseStartup(array $rows): array
    {
        $records = [];
        foreach ($rows as $row) {
            $date = $this->date($row[1] ?? null);
            if ($date === null) {
                continue;
            }
            $record = [
                'date' => $date, 'client' => $this->text($row[3] ?? null), 'model' => $this->text($row[4] ?? null),
                'machineType' => mb_strtoupper($this->text($row[5] ?? null)), 'technician' => $this->text($row[6] ?? null),
                'problem' => $this->text($row[7] ?? null), 'localTreatment' => $this->text($row[8] ?? null),
                'resolution' => $this->text($row[9] ?? null),
            ];
            $record['sourceKey'] = $this->sourceKey($record);
            $records[$record['sourceKey']] = $record;
        }

        return $records;
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function summarize(array $payload): array
    {
        $groups = [
            'reports' => ['label' => 'RAPs', 'table' => 'inspection_reports', 'key' => 'code'],
            'dispatches' => ['label' => 'Produtos coletados', 'table' => 'machine_dispatches', 'key' => 'code'],
            'complaints' => ['label' => 'Reclamações', 'table' => 'customer_complaints', 'key' => 'source_key'],
            'startupProblems' => ['label' => 'Problemas de partida', 'table' => 'startup_problems', 'key' => 'source_key'],
        ];
        $summary = [];
        foreach ($groups as $payloadKey => $definition) {
            $keyName = $definition['key'] === 'source_key' ? 'sourceKey' : 'code';
            $keys = array_column($payload[$payloadKey], $keyName);
            $existing = $keys === [] ? [] : DB::table($definition['table'])->whereIn($definition['key'], $keys)->pluck($definition['key'])->all();
            $summary[] = [
                'key' => $payloadKey, 'label' => $definition['label'], 'total' => count($keys),
                'added' => count(array_diff($keys, $existing)), 'updated' => count(array_intersect($keys, $existing)),
            ];
        }

        return [
            'groups' => $summary,
            'catalogs' => [
                'employees' => count($payload['employees']), 'codes' => count($payload['codes']),
                'productLines' => count($payload['products']),
            ],
            'errorCount' => count($payload['errors']),
        ];
    }

    /** @param array<string, mixed> $payload */
    private function applyCatalogs(array $payload): void
    {
        foreach ($payload['employees'] as $name) {
            DB::table('employees')->updateOrInsert(['normalized_name' => $this->normalize($name)], ['name' => $name, 'is_active' => true]);
        }
        foreach ($payload['codes'] as $code) {
            DB::table('quality_codes')->updateOrInsert(['code' => $code['code']], ['description' => $code['description'], 'position' => $code['position']]);
        }
        foreach ($payload['products'] as $product) {
            $typeId = $this->machineTypeId($product['type']);
            foreach ($product['models'] as $model) {
                DB::table('machine_models')->updateOrInsert(['machine_type_id' => $typeId, 'name' => $model]);
            }
        }
    }

    /** @param list<array<string, mixed>> $records */
    private function applyReports(array $records, int $userId): void
    {
        foreach ($records as $record) {
            $existing = DB::table('inspection_reports')->where('code', $record['code'])->first(['id', 'created_by_user_id']);
            $values = [
                'sequence' => $this->availableSequence('inspection_reports', $record['code'], (int) $record['sequence']),
                'report_date' => $record['date'], 'action_type' => $record['actionType'] ?: 'CORREÇÃO',
                'client_id' => $this->clientId($record['client']), 'machine_type_id' => $this->machineTypeId($record['machineType']),
                'model' => $record['model'] ?: null, 'shed' => $record['shed'] ?: null, 'sector' => $record['sector'] ?: null,
                'gate' => $this->gateName($record['gate']), 'problem_type' => $record['problemType'] ?: null,
                'quality_code_id' => $this->qualityCodeId($record['qualityCode']), 'description' => $record['description'] ?: null,
                'needs_checklist_update' => $record['needsUpdate'], 'immediate_action' => $record['immediateAction'] ?: null,
                'updated_at' => now(),
            ];
            if ($existing === null) {
                $values += ['code' => $record['code'], 'created_by_user_id' => $userId, 'created_at' => now()];
                $id = DB::table('inspection_reports')->insertGetId($values);
            } else {
                $id = (int) $existing->id;
                DB::table('inspection_reports')->where('id', $id)->update($values);
            }
            $this->replaceEmployees('inspection_report_employees', 'inspection_report_id', $id, $record['employees']);
        }
    }

    /** @param list<array<string, mixed>> $records */
    private function applyDispatches(array $records, int $userId): void
    {
        foreach ($records as $record) {
            $existing = DB::table('machine_dispatches')->where('code', $record['code'])->first(['id']);
            $values = [
                'sequence' => $this->availableSequence('machine_dispatches', $record['code'], (int) $record['sequence']),
                'dispatch_date' => $record['date'], 'client_id' => $this->clientId($record['client']),
                'machine_type_id' => $this->machineTypeId($record['machineType']), 'model' => $record['model'] ?: null,
                'notes' => $record['notes'] ?: null, 'needs_form_update' => $record['needsUpdate'],
                'immediate_action' => $record['immediateAction'] ?: null, 'updated_at' => now(),
            ];
            if ($existing === null) {
                $values += ['code' => $record['code'], 'created_by_user_id' => $userId, 'created_at' => now()];
                $id = DB::table('machine_dispatches')->insertGetId($values);
            } else {
                $id = (int) $existing->id;
                DB::table('machine_dispatches')->where('id', $id)->update($values);
            }
            $this->replaceEmployees('machine_dispatch_employees', 'machine_dispatch_id', $id, $record['employees']);
        }
    }

    /** @param list<array<string, mixed>> $records */
    private function applyComplaints(array $records): void
    {
        foreach ($records as $record) {
            DB::table('customer_complaints')->updateOrInsert(['source_key' => $record['sourceKey']], [
                'complaint_date' => $record['date'], 'client_id' => $this->clientId($record['client']),
                'machine_type_id' => $this->machineTypeId($record['machineType']), 'model' => $record['model'] ?: null,
                'problem' => $record['problem'] ?: null, 'local_treatment' => $record['localTreatment'] ?: null,
                'quality_alert' => $record['qualityAlert'] ?: null, 'signatures' => $record['signatures'] ?: null,
            ]);
        }
    }

    /** @param list<array<string, mixed>> $records */
    private function applyStartupProblems(array $records): void
    {
        foreach ($records as $record) {
            DB::table('startup_problems')->updateOrInsert(['source_key' => $record['sourceKey']], [
                'occurred_on' => $record['date'], 'client_id' => $this->clientId($record['client']),
                'machine_type_id' => $this->machineTypeId($record['machineType']), 'model' => $record['model'] ?: null,
                'technician' => $record['technician'] ?: null, 'problem' => $record['problem'] ?: null,
                'local_treatment' => $record['localTreatment'] ?: null, 'resolution' => $record['resolution'] ?: null,
            ]);
        }
    }

    /** @param list<string> $employees */
    private function replaceEmployees(string $table, string $foreignKey, int $recordId, array $employees): void
    {
        DB::table($table)->where($foreignKey, $recordId)->delete();
        foreach (array_values($employees) as $position => $name) {
            $employeeId = DB::table('employees')->where('normalized_name', $this->normalize($name))->value('id');
            if ($employeeId !== null) {
                DB::table($table)->insertOrIgnore([$foreignKey => $recordId, 'employee_id' => $employeeId, 'position' => $position + 1]);
            }
        }
    }

    private function clientId(string $name): ?int
    {
        if ($name === '') {
            return null;
        }
        $normalized = $this->normalize($name);
        DB::table('clients')->updateOrInsert(['normalized_name' => $normalized], ['name' => $name]);

        return (int) DB::table('clients')->where('normalized_name', $normalized)->value('id');
    }

    private function machineTypeId(string $name): ?int
    {
        if ($name === '') {
            return null;
        }
        $name = mb_strtoupper($name);
        DB::table('machine_types')->insertOrIgnore(['name' => $name]);

        return (int) DB::table('machine_types')->where('name', $name)->value('id');
    }

    /**
     * A planilha pode trazer um gate que ainda não está no catálogo. Registrá-lo
     * aqui - como já se faz com código e tipo de máquina - mantém `quality_gates`
     * como a lista completa: sem isso o gate apareceria nos gráficos e sumiria
     * do filtro e da engrenagem.
     */
    private function gateName(string $gate): ?string
    {
        $gate = mb_substr($gate, 0, 30);
        if ($gate === '') {
            return null;
        }
        DB::table('quality_gates')->insertOrIgnore(['name' => $gate, 'position' => 999, 'is_active' => true]);

        return $gate;
    }

    private function qualityCodeId(string $code): ?int
    {
        if ($code === '') {
            return null;
        }
        DB::table('quality_codes')->insertOrIgnore(['code' => $code, 'description' => $code, 'position' => 999]);

        return (int) DB::table('quality_codes')->where('code', $code)->value('id');
    }

    private function availableSequence(string $table, string $code, int $preferred): int
    {
        $owner = DB::table($table)->where('sequence', $preferred)->value('code');

        return $owner === null || $owner === $code ? $preferred : ((int) DB::table($table)->max('sequence')) + 1;
    }

    private function text(mixed $value): string
    {
        if ($value === null || is_bool($value)) {
            return '';
        }

        return trim((string) preg_replace('/\s+/u', ' ', (string) $value));
    }

    private function normalize(string $value): string
    {
        return mb_strtoupper(Str::ascii(trim((string) preg_replace('/\s+/u', ' ', $value))));
    }

    private function date(mixed $value): ?string
    {
        if ($value instanceof DateTimeInterface) {
            return $value->format('Y-m-d');
        }
        if (is_numeric($value) && (float) $value > 1000) {
            try {
                return ExcelDate::excelToDateTimeObject((float) $value)->format('Y-m-d');
            } catch (Throwable) {
                return null;
            }
        }
        $text = $this->text($value);
        foreach (['!d/m/Y', '!Y-m-d', '!d/m/y'] as $format) {
            $date = DateTimeImmutable::createFromFormat($format, $text);
            if ($date !== false) {
                return $date->format('Y-m-d');
            }
        }

        return null;
    }

    private function sequence(string $code): int
    {
        return preg_match('/(\d+)/', $code, $match) ? max(1, (int) $match[1]) : 1;
    }

    /** @param array<string, string> $items */
    private function addUnique(array &$items, string $value): void
    {
        if ($value !== '') {
            $items[$this->normalize($value)] = $value;
        }
    }

    /** @param list<mixed> $items @return list<string> */
    private function nonEmpty(array $items): array
    {
        $result = [];
        foreach ($items as $item) {
            $this->addUnique($result, $this->text($item));
        }

        return array_values($result);
    }

    /** @param array<string, mixed> $record */
    private function sourceKey(array $record): string
    {
        unset($record['sourceKey']);

        return hash('sha256', json_encode(array_map(fn (mixed $value): mixed => is_string($value) ? $this->normalize($value) : $value, $record), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }
}
