<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class QualityApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_cria_rap_pela_api_laravel(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        $machineTypeId = DB::table('machine_types')->insertGetId(['name' => 'LASER']);
        $qualityCodeId = DB::table('quality_codes')->insertGetId([
            'code' => 'COD 1', 'description' => 'Teste', 'position' => 1,
        ]);
        $employeeId = DB::table('employees')->insertGetId([
            'name' => 'Colaborador', 'normalized_name' => 'COLABORADOR', 'is_active' => true,
            'created_at' => now(),
        ]);

        $this->actingAs($user);
        $token = $this->getJson('/backend/api/csrf.php')->json('csrfToken');

        $this->postJson('/backend/api/quality/report-create.php', [
            'csrfToken' => $token,
            'reportDate' => '2026-08-13',
            'actionType' => 'RNC',
            'client' => 'Cliente Teste',
            'machineTypeId' => $machineTypeId,
            'model' => 'Modelo 1',
            'shed' => 'B1',
            'sector' => 'QUALIDADE',
            'gate' => 'GATE 1',
            'problemType' => 'MECÂNICO',
            'qualityCodeId' => $qualityCodeId,
            'description' => 'Descrição completa do problema.',
            'needsChecklistUpdate' => false,
            'employeeIds' => [$employeeId],
        ])->assertCreated()->assertJsonPath('report.code', 'RAP01');

        $this->assertDatabaseHas('inspection_reports', ['code' => 'RAP01', 'created_by_user_id' => $user->id]);
    }
}
