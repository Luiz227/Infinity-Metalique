<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class ActionPlanApiTest extends TestCase
{
    use RefreshDatabase;

    /** Reclamação já gravada, do mesmo cliente e máquina - os catálogos são únicos. */
    private function complaint(string $code = 'RSC01', int $sequence = 1): int
    {
        DB::table('clients')->insertOrIgnore([
            'name' => 'Cliente Teste', 'normalized_name' => 'CLIENTE TESTE', 'created_at' => now(),
        ]);
        DB::table('machine_types')->insertOrIgnore(['name' => 'LASER']);
        $clientId = (int) DB::table('clients')->where('normalized_name', 'CLIENTE TESTE')->value('id');
        $machineTypeId = (int) DB::table('machine_types')->where('name', 'LASER')->value('id');

        return DB::table('customer_complaints')->insertGetId([
            'code' => $code,
            'sequence' => $sequence,
            'complaint_date' => '2026-08-20',
            'client_id' => $clientId,
            'machine_type_id' => $machineTypeId,
            'model' => 'Modelo 1',
            'problem' => 'A máquina chegou com a lataria amassada.',
            'created_at' => now(),
        ]);
    }

    /** @return array{0: User, 1: string} */
    private function admin(): array
    {
        $user = User::factory()->create(['role' => 'admin']);
        $this->actingAs($user);

        return [$user, (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken')];
    }

    public function test_abre_plano_grava_o_log_e_move_a_revisao(): void
    {
        $complaintId = $this->complaint();
        $employeeId = DB::table('employees')->insertGetId([
            'name' => 'Responsável', 'normalized_name' => 'RESPONSAVEL', 'is_active' => true, 'created_at' => now(),
        ]);
        [$user, $token] = $this->admin();

        $planId = $this->postJson('/backend/api/quality/action-plan-create.php', [
            'csrfToken' => $token,
            'complaintId' => $complaintId,
            'openedOn' => '2026-08-21',
            'dueOn' => '2026-09-05',
            'employeeId' => $employeeId,
            'rootCause' => 'Embalagem insuficiente no transporte.',
            'action' => 'Trocar o berço de madeira e refazer a instrução de carregamento.',
            'firstNote' => 'Cliente avisado por telefone.',
        ])
            ->assertCreated()
            ->assertJsonPath('plan.code', 'PAC01')
            ->assertJsonPath('plan.complaint_code', 'RSC01')
            ->assertJsonPath('plan.employee', 'Responsável')
            ->json('plan.id');

        // O marcador da abertura e a nota digitada são duas linhas do log: a
        // linha do tempo conta a história inteira sem depender de outra fonte.
        $this->assertSame(2, DB::table('complaint_action_plan_entries')
            ->where('complaint_action_plan_id', $planId)->count());
        $this->assertDatabaseHas('complaint_action_plan_entries', [
            'complaint_action_plan_id' => $planId,
            'entry_date' => '2026-08-21',
            'note' => 'Plano de ação aberto.',
            'created_by_user_id' => $user->id,
        ]);
        $this->getJson('/backend/api/quality/revision.php')->assertJsonPath('revision', '1');
    }

    public function test_recusa_segundo_plano_para_a_mesma_reclamacao(): void
    {
        $complaintId = $this->complaint();
        [, $token] = $this->admin();
        $payload = [
            'csrfToken' => $token,
            'complaintId' => $complaintId,
            'openedOn' => '2026-08-21',
            'action' => 'Trocar o berço de madeira do carregamento.',
        ];

        $this->postJson('/backend/api/quality/action-plan-create.php', $payload)->assertCreated();
        $this->postJson('/backend/api/quality/action-plan-create.php', $payload)
            ->assertStatus(422)
            ->assertJsonPath('message', 'Esta reclamação já tem um plano de ação.');
    }

    public function test_recusa_prazo_anterior_a_abertura(): void
    {
        $complaintId = $this->complaint();
        [, $token] = $this->admin();

        $this->postJson('/backend/api/quality/action-plan-create.php', [
            'csrfToken' => $token,
            'complaintId' => $complaintId,
            'openedOn' => '2026-08-21',
            'dueOn' => '2026-08-01',
            'action' => 'Trocar o berço de madeira do carregamento.',
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'O prazo previsto não pode ser anterior à abertura.');
    }

    public function test_andamento_aceita_data_retroativa_e_mantem_a_ordem_do_log(): void
    {
        $complaintId = $this->complaint();
        [, $token] = $this->admin();
        $planId = $this->postJson('/backend/api/quality/action-plan-create.php', [
            'csrfToken' => $token,
            'complaintId' => $complaintId,
            'openedOn' => '2026-08-21',
            'action' => 'Trocar o berço de madeira do carregamento.',
        ])->json('plan.id');

        $this->postJson('/backend/api/quality/action-plan-entry.php', [
            'csrfToken' => $token, 'id' => $planId,
            'entryDate' => '2026-09-02', 'note' => 'Peça nova despachada.',
        ])->assertCreated();

        // Lançado depois, mas com data anterior: o log é ordenado pela data do
        // andamento, não pela hora em que alguém voltou ao sistema.
        $this->postJson('/backend/api/quality/action-plan-entry.php', [
            'csrfToken' => $token, 'id' => $planId,
            'entryDate' => '2026-08-25', 'note' => 'Visita técnica agendada.',
        ])->assertCreated();

        $this->getJson("/backend/api/quality/action-plan.php?id={$planId}")
            ->assertOk()
            ->assertJsonPath('plan.entries.0.note', 'Plano de ação aberto.')
            ->assertJsonPath('plan.entries.1.note', 'Visita técnica agendada.')
            ->assertJsonPath('plan.entries.2.note', 'Peça nova despachada.');
    }

    public function test_fecha_e_reabre_o_plano_registrando_cada_passo(): void
    {
        $complaintId = $this->complaint();
        [$user, $token] = $this->admin();
        $planId = $this->postJson('/backend/api/quality/action-plan-create.php', [
            'csrfToken' => $token,
            'complaintId' => $complaintId,
            'openedOn' => '2026-08-21',
            'action' => 'Trocar o berço de madeira do carregamento.',
        ])->json('plan.id');

        $this->postJson('/backend/api/quality/action-plan-close.php', [
            'csrfToken' => $token, 'id' => $planId,
            'closedOn' => '2026-08-10', 'note' => 'Fechado por engano.',
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'O fechamento não pode ser anterior à abertura do plano.');

        $this->postJson('/backend/api/quality/action-plan-close.php', [
            'csrfToken' => $token, 'id' => $planId,
            'closedOn' => '2026-09-10', 'note' => 'Cliente validou a correção.',
        ])->assertOk()->assertJsonPath('plan.closed_on', '2026-09-10');

        $this->assertDatabaseHas('complaint_action_plans', [
            'id' => $planId, 'closed_on' => '2026-09-10', 'closed_by_user_id' => $user->id,
        ]);
        $this->postJson('/backend/api/quality/action-plan-close.php', [
            'csrfToken' => $token, 'id' => $planId, 'closedOn' => '2026-09-11',
        ])->assertStatus(422)->assertJsonPath('message', 'Este plano de ação já está encerrado.');

        $this->postJson('/backend/api/quality/action-plan-close.php', [
            'csrfToken' => $token, 'id' => $planId, 'reopen' => true, 'note' => 'Problema voltou a acontecer.',
        ])->assertOk()->assertJsonPath('plan.closed_on', null);

        $this->assertDatabaseHas('complaint_action_plans', [
            'id' => $planId, 'closed_on' => null, 'closed_by_user_id' => null,
        ]);
        // Abertura, encerramento + nota, reabertura + nota.
        $this->assertSame(5, DB::table('complaint_action_plan_entries')
            ->where('complaint_action_plan_id', $planId)->count());
    }

    public function test_contadores_separam_em_aberto_atrasado_e_concluido(): void
    {
        [, $token] = $this->admin();
        $emDia = $this->complaint('RSC01', 1);
        $atrasado = $this->complaint('RSC02', 2);
        $concluido = $this->complaint('RSC03', 3);
        $open = fn (int $complaintId, ?string $dueOn): int => $this->postJson(
            '/backend/api/quality/action-plan-create.php',
            [
                'csrfToken' => $token, 'complaintId' => $complaintId,
                'openedOn' => now()->subDays(20)->toDateString(), 'dueOn' => $dueOn,
                'action' => 'Trocar o berço de madeira do carregamento.',
            ]
        )->assertCreated()->json('plan.id');

        $open($emDia, now()->addDays(10)->toDateString());
        $open($atrasado, now()->subDay()->toDateString());
        $closedId = $open($concluido, null);
        $this->postJson('/backend/api/quality/action-plan-close.php', [
            'csrfToken' => $token, 'id' => $closedId, 'closedOn' => now()->subDays(10)->toDateString(),
        ])->assertOk();

        $this->getJson('/backend/api/quality/action-plans.php')
            ->assertOk()
            ->assertJsonPath('total', 3)
            ->assertJsonPath('cards.open', 2)
            ->assertJsonPath('cards.late', 1)
            ->assertJsonPath('cards.closed', 1)
            ->assertJsonPath('cards.averageDays', 10);
    }

    public function test_reclamacao_planejada_sai_da_busca_e_volta_apos_a_exclusao(): void
    {
        $complaintId = $this->complaint();
        [, $token] = $this->admin();

        $this->getJson('/backend/api/quality/complaints.php?planStatus=none')
            ->assertOk()->assertJsonPath('total', 1);

        $planId = $this->postJson('/backend/api/quality/action-plan-create.php', [
            'csrfToken' => $token,
            'complaintId' => $complaintId,
            'openedOn' => '2026-08-21',
            'action' => 'Trocar o berço de madeira do carregamento.',
        ])->json('plan.id');

        $this->getJson('/backend/api/quality/complaints.php?planStatus=none')
            ->assertOk()->assertJsonPath('total', 0);
        // A reclamação continua na listagem normal, agora carregando o plano.
        $this->getJson('/backend/api/quality/complaints.php')
            ->assertOk()->assertJsonPath('items.0.plan_code', 'PAC01');

        // O detalhe leva o plano e o log inteiro: é o que a folha impressa do
        // RSC mostra abaixo da ocorrência.
        $this->getJson("/backend/api/quality/complaint.php?id={$complaintId}")
            ->assertOk()
            ->assertJsonPath('complaint.plan_code', 'PAC01')
            ->assertJsonPath('complaint.plan_action', 'Trocar o berço de madeira do carregamento.')
            ->assertJsonPath('complaint.plan_entries.0.note', 'Plano de ação aberto.');

        $this->postJson('/backend/api/quality/action-plan-delete.php', ['csrfToken' => $token, 'id' => $planId])
            ->assertOk()->assertJsonPath('code', 'PAC01');
        $this->getJson('/backend/api/quality/complaints.php?planStatus=none')
            ->assertOk()->assertJsonPath('total', 1);
    }

    public function test_excluir_a_reclamacao_leva_plano_e_log_junto(): void
    {
        $complaintId = $this->complaint();
        [, $token] = $this->admin();
        $planId = $this->postJson('/backend/api/quality/action-plan-create.php', [
            'csrfToken' => $token,
            'complaintId' => $complaintId,
            'openedOn' => '2026-08-21',
            'action' => 'Trocar o berço de madeira do carregamento.',
        ])->json('plan.id');

        $this->postJson('/backend/api/quality/complaint-delete.php', ['csrfToken' => $token, 'id' => $complaintId])
            ->assertOk();

        $this->assertDatabaseMissing('complaint_action_plans', ['id' => $planId]);
        $this->assertDatabaseMissing('complaint_action_plan_entries', ['complaint_action_plan_id' => $planId]);
    }

    public function test_exige_permissao_de_reclamacao_para_tratar_e_de_gestao_para_excluir(): void
    {
        $complaintId = $this->complaint();
        [, $adminToken] = $this->admin();
        $planId = $this->postJson('/backend/api/quality/action-plan-create.php', [
            'csrfToken' => $adminToken,
            'complaintId' => $complaintId,
            'openedOn' => '2026-08-21',
            'action' => 'Trocar o berço de madeira do carregamento.',
        ])->json('plan.id');

        $visitante = User::factory()->create(['role' => 'user']);
        DB::table('user_permissions')->insert([
            ['user_id' => $visitante->id, 'permission' => 'quality.satisfaction'],
        ]);
        $this->actingAs($visitante);
        $token = $this->getJson('/backend/api/csrf.php')->json('csrfToken');

        $this->postJson('/backend/api/quality/action-plan-create.php', [
            'csrfToken' => $token, 'complaintId' => $complaintId,
            'openedOn' => '2026-08-21', 'action' => 'Outra ação qualquer para o teste.',
        ])->assertForbidden();
        $this->postJson('/backend/api/quality/action-plan-entry.php', [
            'csrfToken' => $token, 'id' => $planId, 'entryDate' => '2026-08-25', 'note' => 'Tentativa.',
        ])->assertForbidden();
        $this->postJson('/backend/api/quality/action-plan-close.php', [
            'csrfToken' => $token, 'id' => $planId, 'closedOn' => '2026-08-25',
        ])->assertForbidden();

        // Tratar não é excluir: a exclusão continua atrás de quality.manage.
        DB::table('user_permissions')->insert([
            ['user_id' => $visitante->id, 'permission' => 'quality.create_complaint'],
        ]);
        $this->postJson('/backend/api/quality/action-plan-entry.php', [
            'csrfToken' => $token, 'id' => $planId, 'entryDate' => '2026-08-25', 'note' => 'Agora vai.',
        ])->assertCreated();
        $this->postJson('/backend/api/quality/action-plan-delete.php', ['csrfToken' => $token, 'id' => $planId])
            ->assertForbidden();
    }
}
