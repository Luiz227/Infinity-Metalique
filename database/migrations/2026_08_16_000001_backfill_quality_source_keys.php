<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        $normalize = static fn (mixed $value): mixed => is_string($value)
            ? mb_strtoupper(Str::ascii(trim((string) preg_replace('/\s+/u', ' ', $value))))
            : $value;
        $sourceKey = static function (array $record) use ($normalize): string {
            return hash('sha256', json_encode(array_map($normalize, $record), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        };

        $seen = [];
        DB::table('customer_complaints as c')
            ->leftJoin('clients as cl', 'cl.id', '=', 'c.client_id')
            ->leftJoin('machine_types as mt', 'mt.id', '=', 'c.machine_type_id')
            ->whereNull('c.source_key')->orderBy('c.id')
            ->get(['c.*', 'cl.name as client_name', 'mt.name as machine_type_name'])
            ->each(function (object $row) use (&$seen, $sourceKey): void {
                $key = $sourceKey([
                    'date' => (string) $row->complaint_date,
                    'client' => (string) ($row->client_name ?? ''),
                    'model' => (string) ($row->model ?? ''),
                    'machineType' => (string) ($row->machine_type_name ?? ''),
                    'problem' => (string) ($row->problem ?? ''),
                    'localTreatment' => (string) ($row->local_treatment ?? ''),
                    'qualityAlert' => (string) ($row->quality_alert ?? ''),
                    'signatures' => (string) ($row->signatures ?? ''),
                ]);
                if (! isset($seen[$key])) {
                    DB::table('customer_complaints')->where('id', $row->id)->update(['source_key' => $key]);
                    $seen[$key] = true;
                }
            });

        $seen = [];
        DB::table('startup_problems as s')
            ->leftJoin('clients as cl', 'cl.id', '=', 's.client_id')
            ->leftJoin('machine_types as mt', 'mt.id', '=', 's.machine_type_id')
            ->whereNull('s.source_key')->orderBy('s.id')
            ->get(['s.*', 'cl.name as client_name', 'mt.name as machine_type_name'])
            ->each(function (object $row) use (&$seen, $sourceKey): void {
                $key = $sourceKey([
                    'date' => (string) $row->occurred_on,
                    'client' => (string) ($row->client_name ?? ''),
                    'model' => (string) ($row->model ?? ''),
                    'machineType' => (string) ($row->machine_type_name ?? ''),
                    'technician' => (string) ($row->technician ?? ''),
                    'problem' => (string) ($row->problem ?? ''),
                    'localTreatment' => (string) ($row->local_treatment ?? ''),
                    'resolution' => (string) ($row->resolution ?? ''),
                ]);
                if (! isset($seen[$key])) {
                    DB::table('startup_problems')->where('id', $row->id)->update(['source_key' => $key]);
                    $seen[$key] = true;
                }
            });
    }

    public function down(): void
    {
        DB::table('customer_complaints')->update(['source_key' => null]);
        DB::table('startup_problems')->update(['source_key' => null]);
    }
};
