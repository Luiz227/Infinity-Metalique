<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

final class UserApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_administrador_cria_conta_com_permissoes(): void
    {
        $administrator = User::factory()->create(['role' => 'admin']);
        $this->actingAs($administrator);
        $csrf = $this->getJson('/backend/api/csrf.php')->json('csrfToken');

        $response = $this->postJson('/backend/api/admin/user-save.php', [
            'csrfToken' => $csrf,
            'name' => 'João de Teste',
            'email' => 'joao.teste@example.com',
            'jobTitle' => 'Inspetor',
            'sector' => 'Qualidade',
            'role' => 'user',
            'password' => 'Senha123!',
            'isActive' => true,
            'permissions' => ['quality.raps', 'piperun.view', 'sige.view'],
        ])->assertCreated();

        $user = User::query()->findOrFail($response->json('id'));

        $this->assertTrue(Hash::check('Senha123!', (string) $user->password_hash));
        $this->assertStringStartsWith('$argon2id$', (string) $user->password_hash);
        $this->assertTrue((bool) $user->must_change_password);
        $this->assertDatabaseHas('user_permissions', [
            'user_id' => $user->id,
            'permission' => 'quality.view',
        ]);
        $this->assertDatabaseHas('user_permissions', [
            'user_id' => $user->id,
            'permission' => 'quality.raps',
        ]);
        $this->assertDatabaseHas('user_permissions', [
            'user_id' => $user->id,
            'permission' => 'piperun.view',
        ]);
        $this->assertDatabaseHas('user_permissions', [
            'user_id' => $user->id,
            'permission' => 'sige.view',
        ]);
    }

    public function test_administrador_nao_pode_alterar_a_senha_de_um_usuario(): void
    {
        $administrator = User::factory()->create(['role' => 'admin']);
        $user = User::factory()->create([
            'password_hash' => Hash::make('SenhaOriginal1!'),
            'must_change_password' => false,
        ]);
        $originalHash = (string) $user->password_hash;

        $this->actingAs($administrator);
        $csrf = $this->getJson('/backend/api/csrf.php')->json('csrfToken');

        $this->postJson('/backend/api/admin/user-save.php', [
            'csrfToken' => $csrf,
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'jobTitle' => $user->job_title,
            'sector' => $user->sector,
            'role' => $user->role,
            'password' => 'SenhaForcada2@',
            'isActive' => true,
            'permissions' => ['dashboard.view'],
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'Administradores não podem alterar a senha de outros usuários.');

        $this->assertSame($originalHash, (string) $user->fresh()->password_hash);
        $this->assertFalse((bool) $user->fresh()->must_change_password);
    }

    public function test_usuario_atualiza_o_proprio_perfil(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $csrf = $this->getJson('/backend/api/csrf.php')->json('csrfToken');

        $this->postJson('/backend/api/profile-update.php', [
            'csrfToken' => $csrf,
            'name' => 'Nome Atualizado',
            'nickname' => 'Atualizado',
        ])->assertOk()
            ->assertJsonPath('user.name', 'Nome Atualizado')
            ->assertJsonPath('user.nickname', 'Atualizado');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'name' => 'Nome Atualizado',
            'nickname' => 'Atualizado',
        ]);
    }
}
