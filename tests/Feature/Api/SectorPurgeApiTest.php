<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use App\Support\QualityRevision;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A zona de perigo.
 *
 * O que estes testes protegem não é o caminho feliz - é tudo que não pode
 * acontecer: um não-administrador chegar perto, uma senha errada passar, um
 * expurgo rodar sem backup baixado, um token servir duas vezes, e as contas e
 * ramais irem junto com o setor.
 */
final class SectorPurgeApiTest extends TestCase
{
    use RefreshDatabase;

    private const INDEX = '/backend/api/admin/sector-purge.php';

    private const PREPARE = '/backend/api/admin/sector-purge-prepare.php';

    private const DOWNLOAD = '/backend/api/admin/sector-purge-download.php';

    private const CONFIRM = '/backend/api/admin/sector-purge-confirm.php';

    /** @return array{0: User, 1: string} */
    private function admin(): array
    {
        $user = User::factory()->create(['role' => 'admin']);
        $this->actingAs($user);

        return [$user, (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken')];
    }

    /** Uma conta que administra usuários, mas não é administradora. */
    private function gestorDeUsuarios(): string
    {
        $user = User::factory()->create(['role' => 'user']);
        DB::table('user_permissions')->insert([
            ['user_id' => $user->id, 'permission' => 'users.manage'],
        ]);
        $this->actingAs($user);

        return (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken');
    }

    /** Uma linha em cada tabela da Qualidade, encadeadas como no uso real. */
    private function seedQualidade(): void
    {
        $clientId = DB::table('clients')->insertGetId([
            'name' => 'Cliente Teste', 'normalized_name' => 'CLIENTE TESTE', 'created_at' => now(),
        ]);
        $employeeId = DB::table('employees')->insertGetId([
            'name' => 'Colaborador', 'normalized_name' => 'COLABORADOR', 'is_active' => true, 'created_at' => now(),
        ]);
        $machineTypeId = DB::table('machine_types')->insertGetId(['name' => 'LASER']);
        DB::table('machine_models')->insert(['machine_type_id' => $machineTypeId, 'name' => 'Modelo 1']);
        $codeId = DB::table('quality_codes')->insertGetId([
            'code' => 'COD1', 'description' => 'Falha de montagem', 'position' => 1, 'is_active' => true,
        ]);

        $reportId = DB::table('inspection_reports')->insertGetId([
            'code' => 'RAP01', 'sequence' => 1, 'report_date' => '2026-08-20', 'action_type' => 'CORRETIVA',
            'client_id' => $clientId, 'machine_type_id' => $machineTypeId, 'model' => 'Modelo 1',
            'shed' => 'B1', 'gate' => 'GATE 1', 'quality_code_id' => $codeId,
            'description' => 'Ocorrência de teste.', 'status' => 'registered',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('inspection_report_employees')->insert([
            'inspection_report_id' => $reportId, 'employee_id' => $employeeId, 'position' => 1,
        ]);

        $dispatchId = DB::table('machine_dispatches')->insertGetId([
            'code' => 'RETIR01', 'sequence' => 1, 'dispatch_date' => '2026-08-21',
            'client_id' => $clientId, 'machine_type_id' => $machineTypeId, 'model' => 'Modelo 1',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('machine_dispatch_employees')->insert([
            'machine_dispatch_id' => $dispatchId, 'employee_id' => $employeeId, 'position' => 1,
        ]);
        DB::table('machine_dispatch_photos')->insert([
            'machine_dispatch_id' => $dispatchId,
            'path' => 'assets/uploads/dispatches/foto-de-teste.jpg',
            'position' => 1, 'created_at' => now(),
        ]);

        $complaintId = DB::table('customer_complaints')->insertGetId([
            'code' => 'RSC01', 'sequence' => 1, 'complaint_date' => '2026-08-22',
            'client_id' => $clientId, 'machine_type_id' => $machineTypeId,
            'problem' => 'Lataria amassada.', 'created_at' => now(),
        ]);
        $planId = DB::table('complaint_action_plans')->insertGetId([
            'code' => 'PAC01', 'sequence' => 1, 'customer_complaint_id' => $complaintId,
            'opened_on' => '2026-08-23', 'action' => 'Trocar o berço do carregamento.',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('complaint_action_plan_entries')->insert([
            'complaint_action_plan_id' => $planId, 'entry_date' => '2026-08-24',
            'note' => 'Berço trocado.', 'created_at' => now(),
        ]);

        DB::table('startup_problems')->insert([
            'occurred_on' => '2026-08-19', 'client_id' => $clientId,
            'problem' => 'Não ligou na partida.', 'created_at' => now(),
        ]);
        DB::table('quality_record_edits')->insert([
            'record_type' => 'report', 'record_id' => $reportId, 'record_code' => 'RAP01',
            'changes' => json_encode(['shed' => ['B1', 'B2']]),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('quality_imports')->insert([
            'token' => '11111111-1111-1111-1111-111111111111', 'original_name' => 'planilha.xlsx',
            'file_hash' => str_repeat('a', 64), 'status' => 'completed', 'payload' => '',
            'summary' => json_encode([]), 'expires_at' => now()->addHour(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /**
     * Tudo que é lançamento, sem os cadastros.
     *
     * `planos` fica de fora: ele cai por cascata junto com `satisfacao`, e o
     * servidor tira o repetido da lista para não contar as mesmas linhas duas
     * vezes.
     */
    private const LANCAMENTOS = ['raps', 'coletas', 'satisfacao', 'partida', 'importacoes'];

    /** Tudo, cadastros inclusive. A trava de `requiresAll` exige a lista cheia. */
    private const TUDO = [
        'raps', 'coletas', 'satisfacao', 'planos', 'partida', 'importacoes', 'cadastros',
    ];

    /**
     * @param  list<string>  $groups
     * @return array<string, mixed>
     */
    private function prepareOk(string $csrf, array $groups = self::LANCAMENTOS): array
    {
        return $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => $groups,
            'confirmation' => 'QUALIDADE', 'password' => 'password',
        ])->assertOk()->json();
    }

    /**
     * O token precisa nascer com a janela inteira à frente.
     *
     * Ele já nasceu morto uma vez: `expires_at` era TIMESTAMP, e com
     * `explicit_defaults_for_timestamp=OFF` o MariaDB dá à primeira coluna
     * TIMESTAMP da tabela um `ON UPDATE CURRENT_TIMESTAMP` implícito - o UPDATE
     * que o preparo faz logo em seguida reescrevia a validade para o instante
     * do próprio UPDATE, e a confirmação recusava tudo com "não vale mais".
     *
     * Este teste roda em SQLite, que não tem esse comportamento, então ele
     * guarda a lógica, não o tipo da coluna. Quem guarda o tipo é o
     * `dateTime()` na migration, com o porquê escrito ao lado.
     */
    public function test_o_token_nasce_com_a_janela_inteira(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        $prepared = $this->prepareOk($csrf);
        $registro = DB::table('sector_purges')->where('token', $prepared['token'])->first();

        $this->assertSame('pending', $registro->status);
        $this->assertTrue(
            now()->addMinutes(9)->lessThan($registro->expires_at),
            "A validade nasceu curta demais: criado {$registro->created_at}, expira {$registro->expires_at}."
        );

        // E o download, que também atualiza a linha, não pode encurtá-la.
        $this->baixar($csrf, $prepared['token']);
        $depois = DB::table('sector_purges')->where('token', $prepared['token'])->first();

        $this->assertSame($registro->expires_at, $depois->expires_at);
        $this->assertSame('downloaded', $depois->status);
    }

    /** Baixa o backup e devolve o corpo - é o passo que destrava a exclusão. */
    private function baixar(string $csrf, string $token): string
    {
        return $this->post(self::DOWNLOAD, ['csrfToken' => $csrf, 'token' => $token])
            ->assertOk()->streamedContent();
    }

    /**
     * O caminho inteiro: preparar, baixar, confirmar.
     *
     * @param  list<string>  $groups
     */
    private function expurgar(string $csrf, array $groups = self::LANCAMENTOS): array
    {
        $prepared = $this->prepareOk($csrf, $groups);
        $bytes = strlen($this->baixar($csrf, $prepared['token']));
        $this->postJson(self::CONFIRM, [
            'csrfToken' => $csrf, 'token' => $prepared['token'], 'receivedBytes' => $bytes,
        ])->assertOk();

        return $prepared;
    }

    public function test_quem_nao_e_administrador_nao_alcanca_o_expurgo(): void
    {
        $csrf = $this->gestorDeUsuarios();

        $this->getJson(self::INDEX)->assertForbidden();
        $this->postJson(self::DOWNLOAD, ['csrfToken' => $csrf, 'token' => 'seja-o-que-for'])
            ->assertForbidden();
        $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => self::LANCAMENTOS,
            'confirmation' => 'QUALIDADE', 'password' => 'password',
        ])->assertForbidden();
        $this->postJson(self::CONFIRM, ['csrfToken' => $csrf, 'token' => 'seja-o-que-for'])
            ->assertForbidden();

        $this->assertDatabaseCount('sector_purges', 0);
    }

    /**
     * Guarda de regressão da escolha de autorização: se um dia isto virar chave
     * de permissão, uma linha solta em `user_permissions` abriria a porta.
     */
    public function test_permissao_solta_no_banco_nao_abre_a_zona_de_perigo(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        DB::table('user_permissions')->insert([
            ['user_id' => $user->id, 'permission' => 'users.manage'],
        ]);
        $this->actingAs($user);

        $this->getJson(self::INDEX)->assertForbidden();
    }

    public function test_lista_os_setores_com_as_contagens(): void
    {
        $this->seedQualidade();
        $this->admin();

        $payload = $this->getJson(self::INDEX)->assertOk()->json();

        $this->assertSame('quality', $payload['sectors'][0]['id']);
        $this->assertSame('Qualidade', $payload['sectors'][0]['label']);
        $this->assertSame('QUALIDADE', $payload['sectors'][0]['confirmation']);
        $this->assertNull($payload['lastPurge']);

        // As oito abas do módulo, na ordem da tela - as mesmas de
        // QUALITY_NAVIGATION, ids inclusive.
        $abas = array_column($payload['sectors'][0]['tabs'], null, 'id');
        $this->assertSame(
            ['raps', 'unidades', 'produtos', 'coletas', 'colaboradores', 'qualidade', 'planos', 'registros'],
            array_keys($abas)
        );

        // As abas com banco próprio trazem grupo e contagem.
        $this->assertSame('raps', $abas['raps']['group']);
        $this->assertSame('RAPs', $abas['raps']['label']);
        $this->assertSame(1, $abas['raps']['rows']);
        $this->assertSame(1, $abas['qualidade']['rows']);
        // As fotos são das coletas, e só delas.
        $this->assertSame(1, $abas['coletas']['files']);
        $this->assertSame(0, $abas['raps']['files']);

        // As abas-visão não têm grupo, e dizem de quem dependem.
        $this->assertNull($abas['unidades']['group']);
        $this->assertSame(['raps'], $abas['unidades']['sources']);
        $this->assertSame(['raps', 'coletas'], $abas['produtos']['sources']);
        $this->assertSame(['raps', 'coletas'], $abas['colaboradores']['sources']);
        $this->assertSame(['raps'], $abas['registros']['sources']);
        $this->assertArrayNotHasKey('rows', $abas['unidades']);

        // O plano cai junto com a reclamação: a aba diz isso.
        $this->assertSame(['planos'], $abas['qualidade']['cascades']);

        // O que não tem aba fica à parte, e nada fica inalcançável.
        $extras = array_column($payload['sectors'][0]['extras'], null, 'group');
        $this->assertSame(['partida', 'importacoes', 'cadastros'], array_keys($extras));
        $this->assertSame(1, $extras['partida']['rows']);
        $this->assertTrue($extras['cadastros']['requiresAll']);
        $this->assertFalse($extras['partida']['requiresAll']);

        // Nenhum rótulo pode ser a chave crua: a tela mostra estes textos.
        foreach ($payload['sectors'][0]['tabs'] as $aba) {
            $this->assertNotSame($aba['id'], $aba['label']);
        }
    }

    /**
     * O pedido que motivou os grupos: apagar os apontamentos sem levar o resto
     * do setor junto.
     */
    public function test_apaga_so_os_apontamentos(): void
    {
        $this->seedQualidade();
        // Uma segunda trilha de edição, de outro tipo, que precisa sobreviver.
        DB::table('quality_record_edits')->insert([
            'record_type' => 'dispatch', 'record_id' => 1, 'record_code' => 'RETIR01',
            'changes' => json_encode(['model' => ['A', 'B']]),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        [, $csrf] = $this->admin();

        $this->expurgar($csrf, ['raps']);

        $this->assertDatabaseCount('inspection_reports', 0);
        $this->assertDatabaseCount('inspection_report_employees', 0);

        // Tudo o mais fica de pé, inclusive a trilha de edição dos outros tipos.
        $this->assertDatabaseCount('machine_dispatches', 1);
        $this->assertDatabaseCount('machine_dispatch_photos', 1);
        $this->assertDatabaseCount('customer_complaints', 1);
        $this->assertDatabaseCount('complaint_action_plans', 1);
        $this->assertDatabaseCount('startup_problems', 1);
        $this->assertDatabaseCount('quality_imports', 1);
        $this->assertDatabaseCount('clients', 1);
        $this->assertDatabaseHas('quality_record_edits', ['record_type' => 'dispatch']);
        $this->assertDatabaseMissing('quality_record_edits', ['record_type' => 'report']);

        // As fotos são das coletas, que não foram escolhidas: ficam onde estavam.
        $this->assertDatabaseCount('machine_dispatch_photos', 1);
    }

    public function test_apaga_so_as_coletas_e_leva_as_fotos(): void
    {
        $this->seedQualidade();
        $this->criarFotoNaPastaPublica();
        [, $csrf] = $this->admin();

        $prepared = $this->prepareOk($csrf, ['coletas']);
        $resposta = $this->postJson(self::CONFIRM, [
            'csrfToken' => $csrf,
            'token' => $prepared['token'],
            'receivedBytes' => strlen($this->baixar($csrf, $prepared['token'])),
        ])->assertOk()->json();

        $this->assertDatabaseCount('machine_dispatches', 0);
        $this->assertDatabaseCount('machine_dispatch_photos', 0);
        $this->assertDatabaseCount('machine_dispatch_employees', 0);
        $this->assertDatabaseCount('inspection_reports', 1);

        // A foto acompanha o grupo que a possui, e só ele.
        $this->assertSame(1, $resposta['photos']);
        $this->assertFileExists(
            storage_path('app/purgas/'.$prepared['token'].'/fotos/foto-de-teste.jpg')
        );
    }

    /**
     * Apagar um grupo sem arquivo não pode mexer na pasta pública: só o dono da
     * foto a leva embora.
     */
    public function test_apagar_apontamentos_nao_mexe_nas_fotos_das_coletas(): void
    {
        $this->seedQualidade();
        $arquivo = $this->criarFotoNaPastaPublica();
        [, $csrf] = $this->admin();

        $resposta = $this->postJson(self::CONFIRM, [
            'csrfToken' => $csrf,
            'token' => ($p = $this->prepareOk($csrf, ['raps']))['token'],
            'receivedBytes' => strlen($this->baixar($csrf, $p['token'])),
        ])->assertOk()->json();

        $this->assertSame(0, $resposta['photos']);
        $this->assertFileExists($arquivo);
    }

    private function criarFotoNaPastaPublica(): string
    {
        $publica = public_path('assets/uploads/dispatches');
        if (! is_dir($publica)) {
            mkdir($publica, 0755, true);
        }
        $arquivo = $publica.DIRECTORY_SEPARATOR.'foto-de-teste.jpg';
        file_put_contents($arquivo, 'conteudo-de-teste');

        return $arquivo;
    }

    /**
     * A aba Planos de ação apaga a tratativa e deixa a reclamação: a relação só
     * vale no outro sentido.
     */
    public function test_apaga_so_os_planos_e_a_reclamacao_continua(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        $this->expurgar($csrf, ['planos']);

        $this->assertDatabaseCount('complaint_action_plans', 0);
        $this->assertDatabaseCount('complaint_action_plan_entries', 0);
        $this->assertDatabaseCount('customer_complaints', 1);
        $this->assertDatabaseCount('inspection_reports', 1);
    }

    /**
     * O contrário: apagar a reclamação leva o plano junto, porque o plano é a
     * tratativa dela. Escolher os dois não conta as mesmas linhas duas vezes.
     */
    public function test_apagar_a_satisfacao_leva_os_planos_e_nao_conta_duas_vezes(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        $resposta = $this->postJson(self::CONFIRM, [
            'csrfToken' => $csrf,
            'token' => ($p = $this->prepareOk($csrf, ['satisfacao', 'planos']))['token'],
            'receivedBytes' => strlen($this->baixar($csrf, $p['token'])),
        ])->assertOk()->json();

        $this->assertDatabaseCount('customer_complaints', 0);
        $this->assertDatabaseCount('complaint_action_plans', 0);
        $this->assertDatabaseCount('complaint_action_plan_entries', 0);
        $this->assertDatabaseCount('inspection_reports', 1);

        // Uma linha só no resumo: o plano entrou pela cascata, não à parte.
        $this->assertSame(['satisfacao'], array_column($resposta['counts'], 'key'));
        $this->assertSame(1, $resposta['rows']);
    }

    /**
     * O que a tela manda de verdade quando se marca tudo.
     *
     * Marcar Cadastros marca os sete grupos, mas a tela tira `planos` antes de
     * enviar - ele cai junto com `satisfacao` - e chegam seis. A trava do
     * `requiresAll` precisa aceitar as duas formas; comparando com a lista crua
     * de sete, escolher tudo era recusado como se faltasse alguma coisa.
     */
    public function test_marcar_tudo_e_aceito_com_ou_sem_o_grupo_arrastado(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        // Sem `planos`: exatamente o corpo que o diálogo monta.
        $comoATelaManda = ['raps', 'coletas', 'satisfacao', 'partida', 'importacoes', 'cadastros'];

        $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => $comoATelaManda,
            'confirmation' => 'QUALIDADE', 'password' => 'password',
        ])->assertOk();

        // E com ele, para quem mandar a lista cheia.
        $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => self::TUDO,
            'confirmation' => 'QUALIDADE', 'password' => 'password',
        ])->assertOk();
    }

    /** Marcar tudo como a tela manda apaga tudo mesmo, cadastros inclusive. */
    public function test_marcar_tudo_como_a_tela_manda_zera_o_modulo(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        $this->expurgar($csrf, ['raps', 'coletas', 'satisfacao', 'partida', 'importacoes', 'cadastros']);

        $this->assertDatabaseCount('inspection_reports', 0);
        $this->assertDatabaseCount('machine_dispatches', 0);
        $this->assertDatabaseCount('customer_complaints', 0);
        $this->assertDatabaseCount('complaint_action_plans', 0);
        $this->assertDatabaseCount('startup_problems', 0);
        $this->assertDatabaseCount('clients', 0);
        $this->assertDatabaseCount('employees', 0);
        // As sementes voltam: instalação nova, não estado quebrado.
        $this->assertDatabaseCount('quality_gates', 4);
    }

    /**
     * Um cadastro apagado sob um lançamento vivo não o derruba: a FK é
     * `nullOnDelete`, e o RAP ficaria sem cliente em silêncio.
     */
    public function test_cadastros_nao_podem_ser_apagados_sozinhos(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => ['cadastros'],
            'confirmation' => 'QUALIDADE', 'password' => 'password',
        ])->assertStatus(422);

        $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => ['raps', 'cadastros'],
            'confirmation' => 'QUALIDADE', 'password' => 'password',
        ])->assertStatus(422);

        $this->assertDatabaseCount('sector_purges', 0);
        $this->assertDatabaseCount('clients', 1);
    }

    public function test_lista_de_grupos_vazia_ou_desconhecida_recusa(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        foreach ([[], ['inexistente'], ['users']] as $grupos) {
            $this->postJson(self::PREPARE, [
                'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => $grupos,
                'confirmation' => 'QUALIDADE', 'password' => 'password',
            ])->assertStatus(422);
        }

        $this->assertDatabaseCount('sector_purges', 0);
        $this->assertDatabaseCount('inspection_reports', 1);
    }

    public function test_nome_do_setor_errado_recusa_e_nada_e_apagado(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => self::LANCAMENTOS,
            'confirmation' => 'qualidad', 'password' => 'password',
        ])->assertStatus(422)->assertJsonPath('message', 'Digite QUALIDADE para confirmar.');

        $this->assertDatabaseCount('sector_purges', 0);
        $this->assertDatabaseCount('inspection_reports', 1);
    }

    public function test_o_nome_do_setor_nao_depende_de_caixa_nem_de_espaco(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => self::LANCAMENTOS,
            'confirmation' => ' qualidade ', 'password' => 'password',
        ])->assertOk();
    }

    public function test_senha_errada_recusa_e_nada_e_apagado(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => self::LANCAMENTOS,
            'confirmation' => 'QUALIDADE', 'password' => 'senha-errada',
        ])->assertStatus(422)->assertJsonPath('message', 'A senha está incorreta. Nada foi apagado.');

        $this->assertDatabaseCount('sector_purges', 0);
        $this->assertDatabaseCount('inspection_reports', 1);
    }

    /**
     * O contador é por conta e conta senha errada, não request: um teto por
     * request trancaria o administrador legítimo e daria tentativas infinitas,
     * cinco por minuto, a quem chuta.
     */
    public function test_cinco_senhas_erradas_trancam_a_conta(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        $errada = fn () => $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => self::LANCAMENTOS,
            'confirmation' => 'QUALIDADE', 'password' => 'senha-errada',
        ]);

        for ($tentativa = 0; $tentativa < 5; $tentativa++) {
            $errada()->assertStatus(422);
        }
        $errada()->assertStatus(429);

        // A senha certa também não passa enquanto a tranca estiver de pé.
        $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => self::LANCAMENTOS,
            'confirmation' => 'QUALIDADE', 'password' => 'password',
        ])->assertStatus(429);

        $this->assertDatabaseCount('inspection_reports', 1);
    }

    public function test_setor_desconhecido_e_modo_invalido_recusam(): void
    {
        [, $csrf] = $this->admin();

        $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'financeiro', 'groups' => self::LANCAMENTOS,
            'confirmation' => 'FINANCEIRO', 'password' => 'password',
        ])->assertStatus(422);

        $this->postJson(self::PREPARE, [
            'csrfToken' => $csrf, 'sector' => 'quality', 'groups' => ['inexistente'],
            'confirmation' => 'QUALIDADE', 'password' => 'password',
        ])->assertStatus(422);

        $this->assertDatabaseCount('sector_purges', 0);
    }

    public function test_confirmar_sem_csrf_recusa(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();
        $prepared = $this->prepareOk($csrf);

        $this->postJson(self::CONFIRM, ['token' => $prepared['token']])->assertStatus(419);
        $this->assertDatabaseCount('inspection_reports', 1);
    }

    /**
     * O coração da promessa: sem o download, o servidor recusa - a garantia não
     * depende de a tela se comportar.
     */
    public function test_confirmar_sem_baixar_o_backup_nao_apaga_nada(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();
        $prepared = $this->prepareOk($csrf);

        $this->postJson(self::CONFIRM, [
            'csrfToken' => $csrf, 'token' => $prepared['token'], 'receivedBytes' => $prepared['sizeBytes'],
        ])->assertStatus(422)->assertJsonPath(
            'message',
            'O backup precisa ser baixado antes da exclusão. Nada foi apagado.'
        );

        $this->assertDatabaseCount('inspection_reports', 1);
        $this->assertDatabaseHas('sector_purges', ['token' => $prepared['token'], 'status' => 'pending']);
    }

    public function test_backup_truncado_nao_apaga_nada(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();
        $prepared = $this->prepareOk($csrf);
        $this->baixar($csrf, $prepared['token']);

        $this->postJson(self::CONFIRM, [
            'csrfToken' => $csrf, 'token' => $prepared['token'],
            'receivedBytes' => (int) $prepared['sizeBytes'] - 10,
        ])->assertStatus(422)->assertJsonPath(
            'message',
            'O backup chegou incompleto ao seu computador. Nada foi apagado.'
        );

        $this->assertDatabaseCount('inspection_reports', 1);
        $this->assertDatabaseHas('sector_purges', ['token' => $prepared['token'], 'status' => 'downloaded']);
    }

    public function test_todos_os_lancamentos_caem_e_os_catalogos_ficam(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();
        $revisaoAntes = QualityRevision::current();

        $prepared = $this->prepareOk($csrf);
        $this->assertGreaterThan(0, $prepared['sizeBytes']);

        $backup = $this->baixar($csrf, $prepared['token']);
        $decodificado = json_decode($backup, true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('quality', $decodificado['setor']);
        $this->assertSame(self::LANCAMENTOS, $decodificado['grupos_apagados']);
        $this->assertSame('RAP01', $decodificado['tabelas']['inspection_reports'][0]['code']);
        $this->assertSame('PAC01', $decodificado['tabelas']['complaint_action_plans'][0]['code']);
        // O backup leva os cadastros mesmo quando eles não são apagados: sem
        // eles, os `client_id` guardados não teriam a quem se referir.
        $this->assertSame('Cliente Teste', $decodificado['tabelas']['clients'][0]['name']);

        $this->postJson(self::CONFIRM, [
            'csrfToken' => $csrf, 'token' => $prepared['token'], 'receivedBytes' => strlen($backup),
        ])->assertOk();

        $this->assertDatabaseCount('complaint_action_plan_entries', 0);
        $this->assertDatabaseCount('complaint_action_plans', 0);
        $this->assertDatabaseCount('machine_dispatch_photos', 0);
        $this->assertDatabaseCount('machine_dispatch_employees', 0);
        $this->assertDatabaseCount('inspection_report_employees', 0);
        $this->assertDatabaseCount('machine_dispatches', 0);
        $this->assertDatabaseCount('inspection_reports', 0);
        $this->assertDatabaseCount('customer_complaints', 0);
        $this->assertDatabaseCount('startup_problems', 0);
        $this->assertDatabaseCount('quality_record_edits', 0);
        $this->assertDatabaseCount('quality_imports', 0);

        // Os catálogos ficam: sem eles, o formulário de RAP não teria o que oferecer.
        $this->assertDatabaseCount('clients', 1);
        $this->assertDatabaseCount('employees', 1);
        $this->assertDatabaseCount('machine_types', 1);
        $this->assertDatabaseCount('machine_models', 1);
        $this->assertDatabaseCount('quality_codes', 1);
        $this->assertDatabaseCount('quality_gates', 4);

        $this->assertNotSame($revisaoAntes, QualityRevision::current());
        $this->assertDatabaseHas('sector_purges', ['token' => $prepared['token'], 'status' => 'completed']);

        // O administrador já tem o arquivo: uma segunda cópia integral do banco
        // não fica no servidor para sempre.
        $this->assertFileDoesNotExist(storage_path('app/purgas/'.$prepared['token'].'/dados.json'));
    }

    public function test_apagar_tudo_leva_os_cadastros_e_repoe_as_sementes(): void
    {
        // O retrato de fábrica, tirado antes de qualquer dado entrar. É ele que
        // impede as sementes do registro de divergirem das da migration.
        $gatesDeFabrica = DB::table('quality_gates')->orderBy('position')
            ->get(['name', 'position'])->map(fn ($row) => (array) $row)->all();

        $this->seedQualidade();
        DB::table('quality_settings')->updateOrInsert(
            ['name' => 'raps_monthly_target'],
            ['value' => '12', 'updated_at' => now()]
        );
        [, $csrf] = $this->admin();

        $prepared = $this->prepareOk($csrf, self::TUDO);
        $backup = $this->baixar($csrf, $prepared['token']);
        // A meta vigente entra no backup - o que não está lá não volta nunca.
        $decodificado = json_decode($backup, true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('12', $decodificado['tabelas']['quality_settings'][0]['value']);

        $this->postJson(self::CONFIRM, [
            'csrfToken' => $csrf, 'token' => $prepared['token'], 'receivedBytes' => strlen($backup),
        ])->assertOk();

        $this->assertDatabaseCount('clients', 0);
        $this->assertDatabaseCount('employees', 0);
        $this->assertDatabaseCount('machine_types', 0);
        $this->assertDatabaseCount('machine_models', 0);
        $this->assertDatabaseCount('quality_codes', 0);

        // O setor volta ao estado de instalação nova, não a um estado quebrado.
        $this->assertSame(
            $gatesDeFabrica,
            DB::table('quality_gates')->orderBy('position')->get(['name', 'position'])
                ->map(fn ($row) => (array) $row)->all()
        );
        $this->assertDatabaseHas('quality_settings', ['name' => 'raps_monthly_target', 'value' => null]);
    }

    public function test_o_token_serve_uma_vez_so(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();
        $prepared = $this->expurgar($csrf);

        $this->postJson(self::CONFIRM, [
            'csrfToken' => $csrf, 'token' => $prepared['token'], 'receivedBytes' => $prepared['sizeBytes'],
        ])->assertStatus(422);
    }

    public function test_token_vencido_recusa(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();
        $prepared = $this->prepareOk($csrf);

        $this->travel(11)->minutes();

        $this->postJson(self::DOWNLOAD, ['csrfToken' => $csrf, 'token' => $prepared['token']])
            ->assertStatus(422);
        $this->postJson(self::CONFIRM, [
            'csrfToken' => $csrf, 'token' => $prepared['token'], 'receivedBytes' => $prepared['sizeBytes'],
        ])->assertStatus(422);
        $this->assertDatabaseCount('inspection_reports', 1);
    }

    /** A varredura é oportunista: não há scheduler neste projeto. */
    public function test_a_lista_vence_os_tokens_abandonados_e_apaga_o_dump(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();
        $prepared = $this->prepareOk($csrf);
        $dump = storage_path('app/purgas/'.$prepared['token'].'/dados.json');
        $this->assertFileExists($dump);

        $this->travel(11)->minutes();
        $this->getJson(self::INDEX)->assertOk();

        $this->assertDatabaseHas('sector_purges', ['token' => $prepared['token'], 'status' => 'expired']);
        $this->assertFileDoesNotExist($dump);
    }

    public function test_um_administrador_nao_usa_o_token_do_outro(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();
        $prepared = $this->prepareOk($csrf);

        [, $outroCsrf] = $this->admin();

        $this->postJson(self::DOWNLOAD, ['csrfToken' => $outroCsrf, 'token' => $prepared['token']])
            ->assertStatus(422);
        $this->postJson(self::CONFIRM, [
            'csrfToken' => $outroCsrf, 'token' => $prepared['token'], 'receivedBytes' => $prepared['sizeBytes'],
        ])->assertStatus(422);
        $this->assertDatabaseCount('inspection_reports', 1);
    }

    public function test_um_expurgo_vence_os_tokens_pendentes_do_mesmo_setor(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        $primeiro = $this->prepareOk($csrf);
        $segundo = $this->expurgar($csrf);

        $this->assertDatabaseHas('sector_purges', ['token' => $primeiro['token'], 'status' => 'expired']);
        $this->assertNotSame($primeiro['token'], $segundo['token']);
        $this->postJson(self::CONFIRM, [
            'csrfToken' => $csrf, 'token' => $primeiro['token'], 'receivedBytes' => $primeiro['sizeBytes'],
        ])->assertStatus(422);
    }

    public function test_contas_permissoes_e_ramais_sobrevivem(): void
    {
        $this->seedQualidade();
        [$user, $csrf] = $this->admin();
        DB::table('user_permissions')->insert([['user_id' => $user->id, 'permission' => 'quality.manage']]);
        $ramais = DB::table('phone_extensions')->count();

        $this->expurgar($csrf, self::TUDO);

        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseHas('user_permissions', ['user_id' => $user->id, 'permission' => 'quality.manage']);
        $this->assertSame($ramais, DB::table('phone_extensions')->count());
        // A própria trilha do expurgo não pode se apagar.
        $this->assertDatabaseCount('sector_purges', 1);
    }

    public function test_a_trilha_sobrevive_a_expurgos_seguidos(): void
    {
        $this->seedQualidade();
        [, $csrf] = $this->admin();

        // O primeiro leva os catálogos junto, para o segundo poder semear de novo.
        $this->expurgar($csrf, self::TUDO);
        $this->seedQualidade();
        $this->expurgar($csrf);

        $this->assertDatabaseCount('sector_purges', 2);
        $ultimo = $this->getJson(self::INDEX)->assertOk()->json('lastPurge');
        $this->assertSame('Qualidade', $ultimo['sector']);
        $this->assertNotSame('', $ultimo['user']);
        // A trilha guarda o que foi apagado, em português.
        $this->assertContains('RAPs', $ultimo['groups']);
    }

    public function test_as_fotos_saem_da_pasta_publica_para_o_arquivo_morto(): void
    {
        $this->seedQualidade();
        $publica = public_path('assets/uploads/dispatches');
        if (! is_dir($publica)) {
            mkdir($publica, 0755, true);
        }
        $arquivo = $publica.DIRECTORY_SEPARATOR.'foto-de-teste.jpg';
        file_put_contents($arquivo, 'conteudo-de-teste');

        [, $csrf] = $this->admin();
        $prepared = $this->prepareOk($csrf);
        $bytes = strlen($this->baixar($csrf, $prepared['token']));
        $resposta = $this->postJson(self::CONFIRM, [
            'csrfToken' => $csrf, 'token' => $prepared['token'], 'receivedBytes' => $bytes,
        ])->assertOk()->json();

        $this->assertSame(1, $resposta['photos']);
        $this->assertFileDoesNotExist($arquivo);
        $this->assertFileExists(
            storage_path('app/purgas/'.$prepared['token'].'/fotos/foto-de-teste.jpg')
        );
    }

    protected function tearDown(): void
    {
        // O expurgo escreve fora do banco; a suíte não pode deixar rastro.
        foreach (glob(storage_path('app/purgas/*')) ?: [] as $pasta) {
            foreach (glob($pasta.'/fotos/*') ?: [] as $foto) {
                @unlink($foto);
            }
            @rmdir($pasta.'/fotos');
            @unlink($pasta.'/dados.json');
            @rmdir($pasta);
        }
        @unlink(public_path('assets/uploads/dispatches/foto-de-teste.jpg'));

        parent::tearDown();
    }
}
