<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use App\Services\QualityService;
use App\Support\QualityRevision;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A suíte roda em SQLite, e `quality/options.php` depende de `YEAR()` do MySQL -
 * por isso o contrato dos catálogos é verificado por `quality/settings.php`, que
 * devolve as mesmas listas, e pelo `validateReport`, que é quem decide o que um
 * RAP novo aceita.
 */
final class QualitySettingsApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_salva_meta_gate_novo_e_codigo_novo(): void
    {
        $token = $this->signInAsQualityManager();
        $settings = $this->getJson('/backend/api/quality/settings.php')->assertOk()->json();

        $saved = $this->postJson('/backend/api/quality/settings-save.php', [
            'csrfToken' => $token,
            'rapsMonthlyTarget' => 12,
            'gates' => [...$settings['gates'], ['id' => null, 'name' => 'gate 4', 'active' => true]],
            'codes' => [['id' => null, 'code' => 'cod 1', 'description' => 'Falha de montagem', 'active' => true]],
        ])->assertOk()->assertJsonPath('targets.rapsPerMonth', 12)->json();

        // O texto digitado entra normalizado, como no resto do módulo.
        $this->assertSame('GATE 4', $saved['gates'][4]['name']);
        $this->assertSame(5, $saved['gates'][4]['position']);
        $this->assertDatabaseHas('quality_codes', ['code' => 'COD 1', 'description' => 'Falha de montagem', 'is_active' => true]);
        $this->assertDatabaseHas('quality_settings', ['name' => 'raps_monthly_target', 'value' => '12']);
        $this->assertSame('1', QualityRevision::current());
    }

    public function test_meta_vazia_apaga_a_meta(): void
    {
        $token = $this->signInAsQualityManager();
        $settings = $this->getJson('/backend/api/quality/settings.php')->json();

        $save = fn (mixed $target) => $this->postJson('/backend/api/quality/settings-save.php', [
            'csrfToken' => $token,
            'rapsMonthlyTarget' => $target,
            'gates' => $settings['gates'],
            'codes' => [['id' => null, 'code' => 'COD 1', 'description' => 'Teste', 'active' => true]],
        ]);

        $save(8)->assertOk()->assertJsonPath('targets.rapsPerMonth', 8);
        $save('')->assertOk()->assertJsonPath('targets.rapsPerMonth', null);
        $save(0)->assertStatus(422);
        $save('doze')->assertStatus(422);
    }

    public function test_gate_desativado_sai_do_rap_mas_continua_no_catalogo(): void
    {
        $token = $this->signInAsQualityManager();
        $settings = $this->getJson('/backend/api/quality/settings.php')->json();
        $gates = $settings['gates'];
        $gates[1]['active'] = false;

        $updated = $this->postJson('/backend/api/quality/settings-save.php', [
            'csrfToken' => $token,
            'rapsMonthlyTarget' => null,
            'gates' => $gates,
            'codes' => [['id' => null, 'code' => 'COD 1', 'description' => 'Teste', 'active' => true]],
        ])->assertOk()->json();

        $this->assertSame('GATE 2', $updated['gates'][1]['name']);
        $this->assertFalse($updated['gates'][1]['active']);
    }

    public function test_rap_recusa_gate_e_codigo_inativos(): void
    {
        $quality = app(QualityService::class);
        DB::table('quality_gates')->where('name', 'GATE 2')->update(['is_active' => false]);
        $machineTypeId = DB::table('machine_types')->insertGetId(['name' => 'LASER']);
        $codeId = DB::table('quality_codes')->insertGetId([
            'code' => 'COD 1', 'description' => 'Teste', 'position' => 1, 'is_active' => false,
        ]);
        $employeeId = DB::table('employees')->insertGetId([
            'name' => 'Colaborador', 'normalized_name' => 'COLABORADOR', 'is_active' => true, 'created_at' => now(),
        ]);
        $payload = [
            'reportDate' => '2026-08-21',
            'actionType' => 'RNC',
            'client' => 'Cliente Teste',
            'machineTypeId' => $machineTypeId,
            'sector' => 'QUALIDADE',
            'gate' => 'GATE 2',
            'problemType' => 'MECÂNICO',
            'qualityCodeId' => $codeId,
            'description' => 'Descrição completa do problema.',
            'needsChecklistUpdate' => false,
            'employeeIds' => [$employeeId],
        ];

        $this->assertSame('Selecione o código do problema.', $quality->validateReport($payload)['message']);

        DB::table('quality_codes')->where('id', $codeId)->update(['is_active' => true]);
        $this->assertSame('Selecione o gate da inspeção.', $quality->validateReport($payload)['message']);

        DB::table('quality_gates')->where('name', 'GATE 2')->update(['is_active' => true]);
        $this->assertTrue($quality->validateReport($payload)['success']);
    }

    public function test_gate_em_uso_nao_pode_ser_removido(): void
    {
        $token = $this->signInAsQualityManager();
        $machineTypeId = DB::table('machine_types')->insertGetId(['name' => 'LASER']);
        DB::table('inspection_reports')->insert([
            'code' => 'RAP01', 'sequence' => 1, 'report_date' => '2026-08-21', 'action_type' => 'RNC',
            'machine_type_id' => $machineTypeId, 'gate' => 'GATE 2', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $settings = $this->getJson('/backend/api/quality/settings.php')->assertOk()->json();
        $this->assertSame(1, $settings['gates'][1]['usage']);

        // Sem o GATE 2 no payload, o servidor entende remoção - e recusa.
        $this->postJson('/backend/api/quality/settings-save.php', [
            'csrfToken' => $token,
            'rapsMonthlyTarget' => null,
            'gates' => [$settings['gates'][0], $settings['gates'][2], $settings['gates'][3]],
            'codes' => [['id' => null, 'code' => 'COD 1', 'description' => 'Teste', 'active' => true]],
        ])->assertStatus(422)->assertJsonPath(
            'message',
            'GATE 2 não pode ser removido: 1 RAP usa esse gate. Desative-o em vez de remover.'
        );

        // A recusa desfaz tudo: nem o GATE 3, que estava livre, chegou a sair.
        $this->assertDatabaseHas('quality_gates', ['name' => 'GATE 2']);
        $this->assertDatabaseHas('quality_gates', ['name' => 'GATE 3']);
        $this->assertDatabaseMissing('quality_codes', ['code' => 'COD 1']);
        $this->assertSame('0', QualityRevision::current());
    }

    public function test_gate_sem_uso_pode_ser_removido(): void
    {
        $token = $this->signInAsQualityManager();
        $settings = $this->getJson('/backend/api/quality/settings.php')->json();

        $this->postJson('/backend/api/quality/settings-save.php', [
            'csrfToken' => $token,
            'rapsMonthlyTarget' => null,
            'gates' => [$settings['gates'][0], $settings['gates'][1]],
            'codes' => [['id' => null, 'code' => 'COD 1', 'description' => 'Teste', 'active' => true]],
        ])->assertOk();

        $this->assertDatabaseMissing('quality_gates', ['name' => 'GATE 3']);
        $this->assertDatabaseMissing('quality_gates', ['name' => 'SAÍDA DE MÁQUINAS']);
    }

    public function test_recusa_catalogo_sem_nenhum_item_ativo(): void
    {
        $token = $this->signInAsQualityManager();
        $settings = $this->getJson('/backend/api/quality/settings.php')->json();
        $inactive = array_map(
            static fn (array $gate): array => ['id' => $gate['id'], 'name' => $gate['name'], 'active' => false],
            $settings['gates'],
        );

        $this->postJson('/backend/api/quality/settings-save.php', [
            'csrfToken' => $token,
            'rapsMonthlyTarget' => null,
            'gates' => $inactive,
            'codes' => [['id' => null, 'code' => 'COD 1', 'description' => 'Teste', 'active' => true]],
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Um RAP precisa de pelo menos um gate ativo para ser lançado.');

        $this->postJson('/backend/api/quality/settings-save.php', [
            'csrfToken' => $token,
            'rapsMonthlyTarget' => null,
            'gates' => $settings['gates'],
            'codes' => [],
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Um RAP precisa de pelo menos um código ativo para ser lançado.');
    }

    public function test_engrenagem_exige_permissao_de_gerenciar_qualidade(): void
    {
        $viewer = User::factory()->create(['role' => 'user']);
        DB::table('user_permissions')->insert(['user_id' => $viewer->id, 'permission' => 'quality.raps']);
        $this->actingAs($viewer);
        $this->getJson('/backend/api/quality/settings.php')->assertForbidden();

        $manager = User::factory()->create(['role' => 'user']);
        DB::table('user_permissions')->insert(['user_id' => $manager->id, 'permission' => 'quality.manage']);
        $this->actingAs($manager);
        $this->getJson('/backend/api/quality/settings.php')->assertOk();
    }

    private function signInAsQualityManager(): string
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        return (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken');
    }
}
