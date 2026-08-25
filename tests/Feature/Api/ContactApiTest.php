<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class ContactApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_lista_publica_sai_agrupada_e_sem_sessao(): void
    {
        $payload = $this->getJson('/backend/api/contact.php')->assertOk()->json();

        $this->assertSame(
            ['Térreo Fábrica 1', '1º Andar Fábrica 1', '2º Andar Fábrica 1', 'Térreo Fábrica 2', 'Fábrica 3'],
            array_column($payload['areas'], 'area'),
        );
        $this->assertSame('COZINHA', $payload['areas'][0]['extensions'][0]['sector']);
        $this->assertSame('2025', $payload['areas'][0]['extensions'][0]['number']);
        $this->assertSame('RICKELME E LUCAS SILVA', $payload['areas'][0]['extensions'][1]['people']);
        $this->assertNull($payload['areas'][0]['extensions'][0]['people']);

        // Sem ninguém ter preenchido, os canais gerais chegam vazios - é o que
        // faz o bloco sumir da tela pública.
        $this->assertSame(['phone' => null, 'email' => null, 'address' => null, 'hours' => null], $payload['contacts']);
    }

    public function test_ramal_inativo_some_da_lista_publica_mas_continua_no_painel(): void
    {
        DB::table('phone_extensions')->where('number', '2010')->update(['is_active' => false]);

        $public = $this->getJson('/backend/api/contact.php')->assertOk()->json();
        $this->assertNotContains('2010', $this->numbersOf($public['areas']));

        $this->signInAsContactManager();
        $admin = $this->getJson('/backend/api/admin/contact.php')->assertOk()->json();
        $this->assertContains('2010', array_column($admin['extensions'], 'number'));
    }

    public function test_salvar_grava_renumera_e_remove(): void
    {
        $token = $this->signInAsContactManager();
        $admin = $this->getJson('/backend/api/admin/contact.php')->assertOk()->json();

        // Fica só a primeira linha, com a segunda substituída por uma nova.
        $extensions = [
            ['id' => null, 'area' => 'Fábrica 3', 'sector' => 'ESTOQUE', 'people' => 'MARCOS', 'number' => '2099', 'active' => true],
            $admin['extensions'][0],
        ];

        $saved = $this->postJson('/backend/api/admin/contact-save.php', [
            'csrfToken' => $token,
            'extensions' => $extensions,
            'contacts' => ['phone' => '(41) 3000-0000', 'email' => 'contato@metalique.com.br', 'address' => '', 'hours' => ''],
        ])->assertOk()->json();

        $this->assertCount(2, $saved['extensions']);
        $this->assertSame(['2099', '2025'], array_column($saved['extensions'], 'number'));
        $this->assertSame([1, 2], array_column($saved['extensions'], 'position'));
        $this->assertSame('(41) 3000-0000', $saved['contacts']['phone']);
        $this->assertNull($saved['contacts']['address']);
        $this->assertDatabaseMissing('phone_extensions', ['number' => '2010']);
        $this->assertDatabaseHas('phone_extensions', ['number' => '2099', 'sector' => 'ESTOQUE', 'people' => 'MARCOS']);
    }

    public function test_recusa_ramal_repetido_invalido_e_setor_vazio(): void
    {
        $token = $this->signInAsContactManager();
        $base = ['area' => 'Fábrica 3', 'sector' => 'ESTOQUE', 'people' => '', 'number' => '2099', 'active' => true];
        $save = fn (array $extensions) => $this->postJson('/backend/api/admin/contact-save.php', [
            'csrfToken' => $token,
            'extensions' => $extensions,
            'contacts' => [],
        ]);

        $save([['id' => null] + $base, ['id' => null] + $base])
            ->assertStatus(422)
            ->assertJsonPath('message', 'O ramal 2099 aparece duas vezes na lista.');

        $save([['id' => null] + ['number' => 'A1'] + $base])
            ->assertStatus(422)
            ->assertJsonPath('message', 'O ramal de ESTOQUE precisa ser um número de 2 a 10 dígitos.');

        $save([['id' => null] + ['sector' => ' '] + $base])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Todo ramal precisa do nome do setor.');

        $save([['id' => null] + ['area' => ''] + $base])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Todo ramal precisa de uma área - o prédio ou o andar onde ele fica.');

        // A recusa não deixa rastro: a lista semeada continua inteira.
        $this->assertDatabaseHas('phone_extensions', ['number' => '2010']);
    }

    public function test_recusa_email_invalido_nos_contatos_gerais(): void
    {
        $token = $this->signInAsContactManager();
        $admin = $this->getJson('/backend/api/admin/contact.php')->json();

        $this->postJson('/backend/api/admin/contact-save.php', [
            'csrfToken' => $token,
            'extensions' => $admin['extensions'],
            'contacts' => ['phone' => '', 'email' => 'contato arroba metalique', 'address' => '', 'hours' => ''],
        ])->assertStatus(422)->assertJsonPath('message', 'O e-mail de contato não parece um endereço válido.');
    }

    public function test_painel_exige_permissao_de_administrar_contatos(): void
    {
        $outsider = User::factory()->create(['role' => 'user']);
        DB::table('user_permissions')->insert(['user_id' => $outsider->id, 'permission' => 'dashboard.view']);
        $this->actingAs($outsider);
        $this->getJson('/backend/api/admin/contact.php')->assertForbidden();
        // Com token válido: a recusa precisa vir da permissão, e não do CSRF.
        $token = (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken');
        $this->postJson('/backend/api/admin/contact-save.php', ['csrfToken' => $token, 'extensions' => []])
            ->assertForbidden();

        // A lista pública continua aberta para a mesma conta - e para qualquer um.
        $this->getJson('/backend/api/contact.php')->assertOk();

        $manager = User::factory()->create(['role' => 'user']);
        DB::table('user_permissions')->insert(['user_id' => $manager->id, 'permission' => 'contact.manage']);
        $this->actingAs($manager);
        $this->getJson('/backend/api/admin/contact.php')->assertOk();
    }

    /**
     * @param  list<array<string, mixed>>  $areas
     * @return list<string>
     */
    private function numbersOf(array $areas): array
    {
        $numbers = [];

        foreach ($areas as $area) {
            foreach ($area['extensions'] as $extension) {
                $numbers[] = $extension['number'];
            }
        }

        return $numbers;
    }

    private function signInAsContactManager(): string
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        return (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken');
    }
}
