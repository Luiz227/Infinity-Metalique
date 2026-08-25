<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use App\Services\QualityService;
use App\Support\QualityRevision;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class QualityEditingApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_supervisor_edita_rap_e_historico_preserva_autoria_e_valores_legiveis(): void
    {
        $creator = User::factory()->create(['role' => 'admin', 'name' => 'Criador Original']);
        $editor = $this->qualityUser('súpérvisor de Qualidade', 'Maria Supervisora');
        [$machineTypeId, $qualityCodeId, $firstEmployeeId] = $this->catalogs();
        $secondEmployeeId = DB::table('employees')->insertGetId([
            'name' => 'Bruno Montador',
            'normalized_name' => 'BRUNO MONTADOR',
            'is_active' => true,
            'created_at' => now(),
        ]);
        $quality = app(QualityService::class);
        $report = $quality->createReport($this->reportData(
            $machineTypeId,
            $qualityCodeId,
            [$firstEmployeeId]
        ), (int) $creator->id);

        // Um valor histórico desativado pode permanecer durante uma edição;
        // somente a troca para outro item desativado continua proibida.
        DB::table('quality_codes')->where('id', $qualityCodeId)->update(['is_active' => false]);
        DB::table('quality_gates')->where('name', 'GATE 1')->update(['is_active' => false]);

        $this->actingAs($editor);
        $csrf = (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken');
        $payload = $this->reportPayload(
            $csrf,
            (int) $report['id'],
            $machineTypeId,
            $qualityCodeId,
            [$secondEmployeeId]
        );
        $payload['description'] = 'Descrição revisada pela supervisão com mais detalhes.';

        $response = $this->postJson('/backend/api/quality/report-update.php', $payload)
            ->assertOk()
            ->assertJsonPath('report.code', 'RAP01')
            ->assertJsonPath('report.created_by', 'Criador Original')
            ->assertJsonPath('report.employee_ids.0', $secondEmployeeId)
            ->assertJsonPath('report.edit_history.0.edited_by', 'Maria Supervisora')
            ->assertJsonPath('report.edit_history.0.edited_by_job_title', 'súpérvisor de Qualidade')
            ->assertJsonPath(
                'report.edit_history.0.changes.description.before',
                'Descrição completa do problema original.'
            )
            ->assertJsonPath(
                'report.edit_history.0.changes.description.after',
                'Descrição revisada pela supervisão com mais detalhes.'
            )
            ->assertJsonPath('report.edit_history.0.changes.employees.before.0', 'Ana Inspetora')
            ->assertJsonPath('report.edit_history.0.changes.employees.after.0', 'Bruno Montador');

        $this->assertSame('RAP01', $response->json('report.code'));
        $this->assertDatabaseHas('inspection_reports', [
            'id' => $report['id'],
            'code' => 'RAP01',
            'created_by_user_id' => $creator->id,
        ]);
        $this->assertDatabaseHas('quality_record_edits', [
            'record_type' => 'report',
            'record_id' => $report['id'],
            'record_code' => 'RAP01',
            'edited_by_user_id' => $editor->id,
            'edited_by_name' => 'Maria Supervisora',
            'edited_by_job_title' => 'súpérvisor de Qualidade',
        ]);
        $this->assertSame('2', QualityRevision::current());

        // Repetir exatamente o mesmo conteúdo não cria ruído na auditoria nem
        // desperta os clientes que acompanham QualityRevision.
        $this->postJson('/backend/api/quality/report-update.php', $payload)
            ->assertOk()
            ->assertJsonPath('message', 'Nenhuma alteração foi necessária.');
        $this->assertDatabaseCount('quality_record_edits', 1);
        $this->assertSame('2', QualityRevision::current());

        // Nome e cargo são fatos do momento da edição. Excluir a conta não
        // pode apagar nem reescrever retroativamente a autoria da trilha.
        DB::table('users')->where('id', $editor->id)->delete();
        $this->actingAs($creator);
        $this->getJson('/backend/api/quality/report.php?id='.$report['id'])
            ->assertOk()
            ->assertJsonPath('report.edit_history.0.edited_by', 'Maria Supervisora')
            ->assertJsonPath(
                'report.edit_history.0.edited_by_job_title',
                'súpérvisor de Qualidade'
            );
    }

    public function test_analista_e_supervisor_sem_acesso_a_qualidade_nao_podem_editar(): void
    {
        [$machineTypeId, $qualityCodeId, $employeeId] = $this->catalogs();
        $creator = User::factory()->create(['role' => 'admin']);
        $report = app(QualityService::class)->createReport(
            $this->reportData($machineTypeId, $qualityCodeId, [$employeeId]),
            (int) $creator->id
        );

        $analyst = User::factory()->create([
            'role' => 'user',
            'job_title' => 'Analista de Qualidade',
        ]);
        DB::table('user_permissions')->insert([
            ['user_id' => $analyst->id, 'permission' => 'quality.records', 'created_at' => now()],
            // Mesmo uma chave injetada no banco não torna a permissão atribuível.
            ['user_id' => $analyst->id, 'permission' => 'quality.edit', 'created_at' => now()],
        ]);
        $this->actingAs($analyst);
        $csrf = (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken');
        $this->postJson('/backend/api/quality/report-update.php', $this->reportPayload(
            $csrf,
            (int) $report['id'],
            $machineTypeId,
            $qualityCodeId,
            [$employeeId]
        ))->assertForbidden();

        $unrelatedSupervisor = User::factory()->create([
            'role' => 'user',
            'job_title' => 'Supervisora Comercial',
        ]);
        DB::table('user_permissions')->insert([
            'user_id' => $unrelatedSupervisor->id,
            'permission' => 'dashboard.view',
            'created_at' => now(),
        ]);
        $this->actingAs($unrelatedSupervisor);
        $csrf = (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken');
        $this->postJson('/backend/api/quality/report-update.php', $this->reportPayload(
            $csrf,
            (int) $report['id'],
            $machineTypeId,
            $qualityCodeId,
            [$employeeId]
        ))->assertForbidden();

        $this->assertDatabaseCount('quality_record_edits', 0);
        $this->assertSame('1', QualityRevision::current());
    }

    public function test_supervisor_edita_retir_mantem_e_substitui_fotos_com_historico(): void
    {
        $creator = User::factory()->create(['role' => 'admin']);
        $editor = $this->qualityUser('Coordenador de Expedição', 'Carlos Coordenador');
        [$machineTypeId, , $employeeId] = $this->catalogs();
        $quality = app(QualityService::class);
        $dispatch = $quality->createDispatch([
            'dispatchDate' => '2026-08-20',
            'client' => 'Cliente Teste',
            'machineTypeId' => $machineTypeId,
            'model' => 'Modelo X',
            'notes' => 'Observação original',
            'needsFormUpdate' => false,
            'formChange' => null,
            'immediateAction' => null,
            'employeeIds' => [$employeeId],
        ], [
            'assets/uploads/dispatches/foto-antiga-a.webp',
            'assets/uploads/dispatches/foto-antiga-b.webp',
        ], (int) $creator->id);

        $this->actingAs($editor);
        $csrf = (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken');
        $response = $this->post('/backend/api/quality/dispatch-update.php', [
            'csrfToken' => $csrf,
            'id' => $dispatch['id'],
            'dispatchDate' => '2026-08-21',
            'client' => 'Cliente Teste',
            'machineTypeId' => $machineTypeId,
            'model' => 'Modelo X',
            'notes' => 'Observação atualizada',
            'needsFormUpdate' => false,
            'employeeIds' => [$employeeId],
            'keptPhotos' => ['assets/uploads/dispatches/foto-antiga-b.webp'],
            'photos' => [UploadedFile::fake()->image('foto-nova.jpg', 40, 40)],
        ])->assertOk()
            ->assertJsonPath('dispatch.employee_ids.0', $employeeId)
            ->assertJsonPath('dispatch.edit_history.0.edited_by', 'Carlos Coordenador')
            ->assertJsonPath(
                'dispatch.edit_history.0.changes.photos.before.0',
                'assets/uploads/dispatches/foto-antiga-a.webp'
            )
            ->assertJsonPath(
                'dispatch.edit_history.0.changes.photos.after.0',
                'assets/uploads/dispatches/foto-antiga-b.webp'
            );

        $photos = $response->json('dispatch.photos');
        $this->assertCount(2, $photos);
        $this->assertSame('assets/uploads/dispatches/foto-antiga-b.webp', $photos[0]);
        $this->assertStringStartsWith('assets/uploads/dispatches/', $photos[1]);
        $this->assertFileExists(public_path($photos[1]));
        $this->assertDatabaseMissing('machine_dispatch_photos', [
            'machine_dispatch_id' => $dispatch['id'],
            'path' => 'assets/uploads/dispatches/foto-antiga-a.webp',
        ]);
        $this->assertDatabaseHas('machine_dispatch_photos', [
            'machine_dispatch_id' => $dispatch['id'],
            'path' => $photos[1],
        ]);

        @unlink(public_path($photos[1]));
    }

    public function test_supervisor_edita_satisfacao_e_detalhe_traz_historico(): void
    {
        $creator = User::factory()->create(['role' => 'admin']);
        $editor = $this->qualityUser('Diretora Industrial', 'Diana Diretora');
        [$machineTypeId] = $this->catalogs();
        $complaint = app(QualityService::class)->createComplaint([
            'complaintDate' => '2026-08-20',
            'client' => 'Cliente Teste',
            'machineTypeId' => $machineTypeId,
            'model' => 'Modelo X',
            'problem' => 'Problema original informado pelo cliente.',
            'localTreatment' => null,
            'qualityAlert' => null,
        ], (int) $creator->id);

        $this->actingAs($editor);
        $csrf = (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken');
        $this->postJson('/backend/api/quality/complaint-update.php', [
            'csrfToken' => $csrf,
            'id' => $complaint['id'],
            'complaintDate' => '2026-08-20',
            'client' => 'Cliente Teste',
            'machineTypeId' => $machineTypeId,
            'model' => 'Modelo X',
            'problem' => 'Problema revisado e confirmado com o cliente.',
            'localTreatment' => 'Tratamento local registrado após contato.',
            'qualityAlert' => 'ALERTA 9',
        ])->assertOk()
            ->assertJsonPath('complaint.code', 'RSC01')
            ->assertJsonPath('complaint.created_by', $creator->name)
            ->assertJsonPath('complaint.edit_history.0.edited_by', 'Diana Diretora')
            ->assertJsonPath(
                'complaint.edit_history.0.changes.problem.before',
                'Problema original informado pelo cliente.'
            )
            ->assertJsonPath(
                'complaint.edit_history.0.changes.problem.after',
                'Problema revisado e confirmado com o cliente.'
            );

        $this->getJson('/backend/api/quality/complaint.php?id='.$complaint['id'])
            ->assertOk()
            ->assertJsonCount(1, 'complaint.edit_history')
            ->assertJsonPath('complaint.edit_history.0.edited_by_job_title', 'Diretora Industrial');
    }

    private function qualityUser(string $jobTitle, string $name): User
    {
        $user = User::factory()->create([
            'role' => 'user',
            'name' => $name,
            'job_title' => $jobTitle,
        ]);
        DB::table('user_permissions')->insert([
            'user_id' => $user->id,
            'permission' => 'quality.records',
            'created_at' => now(),
        ]);

        return $user;
    }

    /** @return array{int, int, int} */
    private function catalogs(): array
    {
        $machineTypeId = DB::table('machine_types')->insertGetId(['name' => 'LASER']);
        $qualityCodeId = DB::table('quality_codes')->insertGetId([
            'code' => 'COD 1',
            'description' => 'Montagem incorreta',
            'position' => 1,
            'is_active' => true,
        ]);
        $employeeId = DB::table('employees')->insertGetId([
            'name' => 'Ana Inspetora',
            'normalized_name' => 'ANA INSPETORA',
            'is_active' => true,
            'created_at' => now(),
        ]);

        return [$machineTypeId, $qualityCodeId, $employeeId];
    }

    /** @param list<int> $employeeIds @return array<string, mixed> */
    private function reportData(int $machineTypeId, int $qualityCodeId, array $employeeIds): array
    {
        return [
            'reportDate' => '2026-08-20',
            'actionType' => 'RNC',
            'client' => 'Cliente Teste',
            'machineTypeId' => $machineTypeId,
            'model' => 'Modelo X',
            'shed' => 'B1',
            'sector' => 'QUALIDADE',
            'gate' => 'GATE 1',
            'problemType' => 'MECÂNICO',
            'qualityCodeId' => $qualityCodeId,
            'description' => 'Descrição completa do problema original.',
            'needsChecklistUpdate' => false,
            'checklistChange' => null,
            'immediateAction' => null,
            'employeeIds' => $employeeIds,
        ];
    }

    /** @param list<int> $employeeIds @return array<string, mixed> */
    private function reportPayload(
        string $csrf,
        int $id,
        int $machineTypeId,
        int $qualityCodeId,
        array $employeeIds
    ): array {
        return ['csrfToken' => $csrf, 'id' => $id]
            + $this->reportData($machineTypeId, $qualityCodeId, $employeeIds);
    }
}
