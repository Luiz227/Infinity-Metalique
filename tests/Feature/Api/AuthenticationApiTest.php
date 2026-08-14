<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use App\Support\UserPresence;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

final class AuthenticationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_csrf_inicia_a_sessao_sem_usuario(): void
    {
        $this->getJson('/backend/api/csrf.php')
            ->assertOk()
            ->assertJsonPath('user', null)
            ->assertJsonStructure(['csrfToken']);
    }

    public function test_login_usa_a_sessao_e_o_model_do_laravel(): void
    {
        $user = User::factory()->create([
            'password_hash' => Hash::make('Senha123!'),
            'is_active' => true,
        ]);
        $token = $this->getJson('/backend/api/csrf.php')->json('csrfToken');

        $login = $this->postJson('/backend/api/login.php', [
            'csrfToken' => $token,
            'email' => $user->email,
            'password' => 'Senha123!',
        ])->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonStructure(['csrfToken']);

        $this->assertAuthenticatedAs($user);
        $this->getJson('/backend/api/session.php')->assertOk()->assertJsonPath('user.id', $user->id);

        $this->postJson('/backend/api/profile-update.php', [
            'csrfToken' => $login->json('csrfToken'),
            'name' => 'Usuário Autenticado',
            'nickname' => 'Autenticado',
        ])->assertOk();
    }

    public function test_post_sem_token_csrf_e_rejeitado(): void
    {
        $this->postJson('/backend/api/login.php', [])->assertStatus(419);
    }

    public function test_atividade_e_logout_atualizam_a_presenca(): void
    {
        $user = User::factory()->create([
            'password_hash' => Hash::make('Senha123!'),
        ]);
        $csrf = $this->getJson('/backend/api/csrf.php')->json('csrfToken');

        $login = $this->postJson('/backend/api/login.php', [
            'csrfToken' => $csrf,
            'email' => $user->email,
            'password' => 'Senha123!',
        ])->assertOk();

        $this->assertSame('online', UserPresence::status((int) $user->id));

        $this->travel(6)->minutes();
        $this->assertSame('away', UserPresence::status((int) $user->id));

        $this->postJson('/backend/api/presence-heartbeat.php', [
            'csrfToken' => $login->json('csrfToken'),
        ])->assertOk()->assertJsonPath('presence', 'online');
        $this->assertSame('online', UserPresence::status((int) $user->id));

        $this->postJson('/backend/api/logout.php', [
            'csrfToken' => $login->json('csrfToken'),
        ])->assertOk();
        $this->assertSame('offline', UserPresence::status((int) $user->id));
    }

    public function test_solicitacao_de_acesso_e_gravada_pelo_laravel(): void
    {
        $token = $this->getJson('/backend/api/csrf.php')->json('csrfToken');

        $this->postJson('/backend/api/access-request.php', [
            'csrfToken' => $token,
            'name' => 'Maria da Silva',
            'sector' => 'Qualidade',
            'jobTitle' => 'Inspetora',
            'admissionDate' => now()->toDateString(),
        ])->assertCreated();

        $this->assertDatabaseHas('access_requests', [
            'name' => 'Maria da Silva',
            'status' => 'pending',
        ]);
    }

    public function test_fluxo_completo_de_recuperacao_de_senha(): void
    {
        $user = User::factory()->create(['password_hash' => Hash::make('SenhaAntiga1!')]);
        $administrator = User::factory()->create(['role' => 'admin']);
        $csrf = $this->getJson('/backend/api/csrf.php')->json('csrfToken');

        $requestToken = $this->postJson('/backend/api/password-reset-request.php', [
            'csrfToken' => $csrf,
            'email' => $user->email,
        ])->assertOk()->json('requestToken');

        $requestId = DB::table('password_reset_requests')->where('user_id', $user->id)->value('id');

        $this->actingAs($administrator)
            ->postJson('/backend/api/admin/password-reset-decision.php', [
                'csrfToken' => $csrf,
                'id' => $requestId,
                'decision' => 'approve',
            ])->assertOk();

        $this->postJson('/backend/api/password-reset-status.php', [
            'csrfToken' => $csrf,
            'email' => $user->email,
            'requestToken' => $requestToken,
        ])->assertOk()->assertJsonPath('status', 'approved');

        $this->postJson('/backend/api/password-reset-complete.php', [
            'csrfToken' => $csrf,
            'email' => $user->email,
            'requestToken' => $requestToken,
            'newPassword' => 'SenhaNova2@',
            'confirmation' => 'SenhaNova2@',
        ])->assertOk();

        $this->assertTrue(Hash::check('SenhaNova2@', (string) $user->fresh()->password_hash));
        $this->assertDatabaseHas('password_reset_requests', [
            'id' => $requestId,
            'status' => 'completed',
        ]);
    }

    public function test_troca_obrigatoria_de_senha_libera_a_conta(): void
    {
        $user = User::factory()->create([
            'password_hash' => Hash::make('SenhaAntiga1!'),
            'must_change_password' => true,
        ]);
        $this->actingAs($user);
        $csrf = $this->getJson('/backend/api/csrf.php')->json('csrfToken');

        $this->getJson('/backend/api/search.php?q=rap')->assertStatus(428);

        $this->postJson('/backend/api/password-change.php', [
            'csrfToken' => $csrf,
            'currentPassword' => 'SenhaAntiga1!',
            'newPassword' => 'SenhaNova2@',
            'confirmation' => 'SenhaNova2@',
        ])->assertOk()->assertJsonPath('user.must_change_password', false);

        $this->assertFalse((bool) $user->fresh()->must_change_password);
    }

    public function test_permissao_e_aplicada_pelo_middleware_laravel(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->getJson('/backend/api/admin/users.php')->assertForbidden();

        DB::table('user_permissions')->insert([
            'user_id' => $user->id,
            'permission' => 'users.manage',
            'created_at' => now(),
        ]);

        $this->getJson('/backend/api/admin/users.php')->assertOk()->assertJsonStructure(['users', 'permissions']);
    }
}
