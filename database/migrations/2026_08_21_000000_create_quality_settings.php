<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
|--------------------------------------------------------------------------
| Catálogos editáveis da Qualidade
|--------------------------------------------------------------------------
|
| Os gates deixam de ser constante no PHP e viram tabela, os códigos ganham
| desativação e as metas ganham onde morar. Tudo pelo Schema Builder: os testes
| rodam a suíte inteira em SQLite na memória.
|
*/
return new class extends Migration
{
    /** Os gates que viviam em QualityService::GATES, na ordem em que apareciam. */
    private const SEED_GATES = ['GATE 1', 'GATE 2', 'GATE 3', 'SAÍDA DE MÁQUINAS'];

    public function up(): void
    {
        if (! Schema::hasTable('quality_gates')) {
            Schema::create('quality_gates', function (Blueprint $table): void {
                $table->id();
                $table->string('name', 30)->unique();
                $table->unsignedInteger('position')->default(0);
                $table->boolean('is_active')->default(true);
            });
        }

        $this->seedGates();

        if (! Schema::hasColumn('quality_codes', 'is_active')) {
            Schema::table('quality_codes', function (Blueprint $table): void {
                $table->boolean('is_active')->default(true);
            });
        }

        if (! Schema::hasTable('quality_settings')) {
            Schema::create('quality_settings', function (Blueprint $table): void {
                $table->string('name', 60)->primary();
                $table->string('value', 120)->nullable();
                $table->timestamp('updated_at')->nullable();
            });
        }

        // Valor nulo de propósito: não há meta até alguém definir uma, e a
        // ausência da meta é o que apaga a linha tracejada dos gráficos.
        DB::table('quality_settings')->insertOrIgnore([
            'name' => 'raps_monthly_target',
            'value' => null,
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('quality_settings');
        Schema::dropIfExists('quality_gates');

        if (Schema::hasColumn('quality_codes', 'is_active')) {
            Schema::table('quality_codes', function (Blueprint $table): void {
                $table->dropColumn('is_active');
            });
        }
    }

    /**
     * Primeiro os quatro gates conhecidos, na ordem certa; depois qualquer gate
     * que já esteja gravado num RAP. Sem esse segundo passo um gate que entrou
     * por planilha ficaria fora do catálogo e sumiria do filtro.
     */
    private function seedGates(): void
    {
        foreach (self::SEED_GATES as $position => $name) {
            DB::table('quality_gates')->insertOrIgnore([
                'name' => $name,
                'position' => $position + 1,
                'is_active' => true,
            ]);
        }

        if (! Schema::hasTable('inspection_reports')) {
            return;
        }

        $historical = DB::table('inspection_reports')
            ->whereNotNull('gate')->where('gate', '<>', '')
            ->distinct()->pluck('gate');

        foreach ($historical as $gate) {
            $name = mb_substr(mb_strtoupper(trim((string) $gate)), 0, 30);
            if ($name === '' || in_array($name, self::SEED_GATES, true)) {
                continue;
            }
            DB::table('quality_gates')->insertOrIgnore([
                'name' => $name,
                'position' => 999,
                'is_active' => true,
            ]);
        }
    }
};
