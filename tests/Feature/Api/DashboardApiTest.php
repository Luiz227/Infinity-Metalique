<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use App\Support\QualityRevision;
use App\Support\UserPresence;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class DashboardApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_lista_supervisores_ativos_pelo_cargo_e_setor(): void
    {
        $viewer = User::factory()->create();
        DB::table('user_permissions')->insert([
            'user_id' => $viewer->id,
            'permission' => 'dashboard.view',
        ]);

        $supervisor = User::factory()->create([
            'name' => 'Maria Supervisora',
            'sector' => 'QUALIDADE',
            'job_title' => 'Supervisor da Qualidade',
        ]);
        User::factory()->create([
            'sector' => 'QUALIDADE',
            'job_title' => 'Analista da Qualidade',
        ]);
        User::factory()->create([
            'sector' => 'QUALIDADE',
            'job_title' => 'Supervisor de turno',
            'is_active' => false,
        ]);

        $this->actingAs($viewer)
            ->getJson('/backend/api/dashboard/supervisors.php')
            ->assertOk()
            ->assertJsonCount(1, 'supervisors')
            ->assertJsonPath('supervisors.0.id', $supervisor->id)
            ->assertJsonPath('supervisors.0.name', 'Maria Supervisora')
            ->assertJsonPath('supervisors.0.sector', 'QUALIDADE')
            ->assertJsonPath('supervisors.0.presence', 'offline');
    }

    public function test_informa_presenca_online_ausente_e_offline_do_supervisor(): void
    {
        $viewer = User::factory()->create();
        DB::table('user_permissions')->insert([
            'user_id' => $viewer->id,
            'permission' => 'dashboard.view',
        ]);
        $supervisor = User::factory()->create([
            'name' => 'Supervisor Presente',
            'sector' => 'Qualidade',
            'job_title' => 'Supervisor da Qualidade',
        ]);

        UserPresence::touch((int) $supervisor->id);

        $this->actingAs($viewer)
            ->getJson('/backend/api/dashboard/supervisors.php')
            ->assertOk()
            ->assertJsonPath('supervisors.0.presence', 'online');

        $this->travel(6)->minutes();
        $this->getJson('/backend/api/dashboard/supervisors.php')
            ->assertOk()
            ->assertJsonPath('supervisors.0.presence', 'away');

        $this->travel(2)->hours();
        $this->getJson('/backend/api/dashboard/supervisors.php')
            ->assertOk()
            ->assertJsonPath('supervisors.0.presence', 'offline');
    }

    public function test_exige_permissao_do_dashboard_para_consultar_supervisores(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/backend/api/dashboard/supervisors.php')
            ->assertForbidden();
    }

    public function test_dashboard_observa_a_mesma_revisao_sem_ganhar_acesso_a_qualidade(): void
    {
        $viewer = User::factory()->create();
        DB::table('user_permissions')->insert([
            'user_id' => $viewer->id,
            'permission' => 'dashboard.view',
        ]);
        QualityRevision::bump();

        $this->actingAs($viewer)
            ->getJson('/backend/api/dashboard/quality-revision.php')
            ->assertOk()
            ->assertJsonPath('revision', '1');

        $this->getJson('/backend/api/quality/revision.php')->assertForbidden();

        $this->actingAs(User::factory()->create())
            ->getJson('/backend/api/dashboard/quality-revision.php')
            ->assertForbidden();
    }
}
