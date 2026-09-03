<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use App\Support\UserPreferences;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class PreferencesApiTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function signIn(string $role = 'admin'): array
    {
        $user = User::factory()->create(['role' => $role]);
        $this->actingAs($user);

        return [$user, (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken')];
    }

    public function test_conta_nova_recebe_os_padroes_junto_da_sessao(): void
    {
        [$user] = $this->signIn();

        $this->assertSame([], DB::table('user_preferences')->where('user_id', $user->id)->get()->all());
        $this->getJson('/backend/api/session.php')
            ->assertOk()
            ->assertJsonPath('user.preferences', UserPreferences::defaults());
    }

    public function test_grava_o_bloco_e_devolve_ele_na_sessao_seguinte(): void
    {
        [$user, $token] = $this->signIn();

        $this->postJson('/backend/api/preferences-save.php', [
            'csrfToken' => $token,
            'preferences' => [
                'theme' => 'system',
                'startRoute' => '/qualidade',
                'qualityTab' => 'registros',
                'reduceMotion' => true,
                'smoothScroll' => false,
                'mutedNotifications' => ['quality'],
                'notificationsInterval' => 120,
            ],
        ])->assertOk()->assertJsonPath('preferences.theme', 'system');

        $this->getJson('/backend/api/session.php')
            ->assertOk()
            ->assertJsonPath('user.preferences.startRoute', '/qualidade')
            ->assertJsonPath('user.preferences.smoothScroll', false)
            ->assertJsonPath('user.preferences.mutedNotifications', ['quality']);

        $this->assertSame(1, DB::table('user_preferences')->where('user_id', $user->id)->count());
    }

    public function test_peneira_chave_desconhecida_e_valor_invalido(): void
    {
        [, $token] = $this->signIn();

        $response = $this->postJson('/backend/api/preferences-save.php', [
            'csrfToken' => $token,
            'preferences' => [
                'theme' => 'neon',
                'startRoute' => '/rota-que-nao-existe',
                'notificationsInterval' => 7,
                'mutedNotifications' => ['quality', 'inventado'],
                'apagarTudo' => true,
            ],
        ])->assertOk();

        // Valor fora da lista volta ao padrão em vez de gravar o que veio.
        $response->assertJsonPath('preferences.theme', 'light');
        $response->assertJsonPath('preferences.startRoute', 'auto');
        $response->assertJsonPath('preferences.notificationsInterval', 30);
        // O tipo válido sobrevive mesmo acompanhado de um inventado.
        $response->assertJsonPath('preferences.mutedNotifications', ['quality']);
        $this->assertArrayNotHasKey('apagarTudo', (array) $response->json('preferences'));
    }

    public function test_exige_o_token_csrf(): void
    {
        $this->signIn();

        $this->postJson('/backend/api/preferences-save.php', [
            'preferences' => ['theme' => 'dark'],
        ])->assertStatus(419);
    }

    public function test_exige_sessao(): void
    {
        $this->postJson('/backend/api/preferences-save.php', [
            'preferences' => ['theme' => 'dark'],
        ])->assertStatus(401);
    }

    /**
     * O bloco da Qualidade fica silenciado nos dois passos de propósito: a
     * consulta dele é SQL cru de MySQL (`DATE_SUB`, `CONCAT`) e não roda no
     * SQLite da suíte. Silenciado, ele nem é montado - o que já é metade do que
     * este teste precisa provar.
     */
    public function test_tipo_silenciado_some_do_sino(): void
    {
        [$user] = $this->signIn();
        DB::table('access_requests')->insert([
            'name' => 'Candidato', 'email' => 'candidato@metalique.com.br',
            'sector' => 'Produção', 'job_title' => 'Operador', 'admission_date' => '2026-08-01',
            'status' => 'pending', 'created_at' => now(),
        ]);

        UserPreferences::store((int) $user->id, ['mutedNotifications' => ['quality']]);
        $this->getJson('/backend/api/notifications.php')
            ->assertOk()
            ->assertJsonCount(1, 'notifications')
            ->assertJsonPath('notifications.0.kind', 'access-request');

        UserPreferences::store((int) $user->id, ['mutedNotifications' => ['quality', 'access-request']]);
        $this->getJson('/backend/api/notifications.php')
            ->assertOk()
            ->assertJsonCount(0, 'notifications');
    }

    public function test_notificacoes_de_qualidade_aparecem_so_para_qualidade_e_nunca_para_o_criador(): void
    {
        $creator = User::factory()->create(['name' => 'Maria Operacao', 'sector' => 'Produção']);
        $quality = User::factory()->create(['name' => 'Fabio Qualidade', 'sector' => 'Qualidade']);
        DB::table('user_permissions')->insert([
            ['user_id' => $creator->id, 'permission' => 'quality.create_rap'],
            ['user_id' => $creator->id, 'permission' => 'quality.create_dispatch'],
            ['user_id' => $quality->id, 'permission' => 'quality.create_rap'],
        ]);

        DB::table('inspection_reports')->insert([
            [
                'code' => 'RAP01',
                'sequence' => 1,
                'report_date' => '2026-09-03',
                'action_type' => 'RNC',
                'created_by_user_id' => $creator->id,
                'created_at' => now()->subMinutes(2),
                'updated_at' => now()->subMinutes(2),
            ],
            [
                'code' => 'RAP02',
                'sequence' => 2,
                'report_date' => '2026-09-03',
                'action_type' => 'RNC',
                'created_by_user_id' => $quality->id,
                'created_at' => now()->subMinute(),
                'updated_at' => now()->subMinute(),
            ],
        ]);
        DB::table('machine_dispatches')->insert([
            'code' => 'RETIR1',
            'sequence' => 1,
            'dispatch_date' => '2026-09-03',
            'created_by_user_id' => $creator->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($quality);
        $qualityResponse = $this->getJson('/backend/api/notifications.php')->assertOk();
        $qualityResponse->assertJsonCount(2, 'notifications');
        $this->assertSame(
            ['Nova coleta RETIR1', 'Novo RAP01'],
            array_column($qualityResponse->json('notifications'), 'title')
        );

        $this->actingAs($creator);
        $this->getJson('/backend/api/notifications.php')
            ->assertOk()
            ->assertJsonCount(0, 'notifications');
    }

    public function test_admin_fora_da_qualidade_nao_recebe_notificacoes_de_rap_ou_coleta(): void
    {
        $creator = User::factory()->create(['name' => 'Maria Operacao', 'sector' => 'Qualidade']);
        $admin = User::factory()->create(['role' => 'admin', 'sector' => 'Desenvolvimento']);

        DB::table('inspection_reports')->insert([
            'code' => 'RAP01',
            'sequence' => 1,
            'report_date' => '2026-09-03',
            'action_type' => 'RNC',
            'created_by_user_id' => $creator->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($admin);
        $this->getJson('/backend/api/notifications.php')
            ->assertOk()
            ->assertJsonCount(0, 'notifications');
    }
}
