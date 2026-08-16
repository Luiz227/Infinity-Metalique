<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
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

    public function test_importa_planilha_com_previa_e_sem_duplicar_registros(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        $path = $this->qualityWorkbook();

        try {
            $this->actingAs($user);
            $token = $this->getJson('/backend/api/csrf.php')->json('csrfToken');
            $preview = $this->post('/backend/api/quality/import-preview.php', [
                'csrfToken' => $token,
                'file' => new UploadedFile($path, 'inspecao.xlsx', null, null, true),
            ])->assertCreated()->assertJsonPath('summary.groups.0.added', 1);

            $this->postJson('/backend/api/quality/import-confirm.php', [
                'csrfToken' => $token,
                'token' => $preview->json('token'),
            ])->assertOk()->assertJsonPath('message', 'Planilha importada com sucesso.');

            $this->assertDatabaseCount('inspection_reports', 1);
            $this->assertDatabaseCount('machine_dispatches', 1);
            $this->assertDatabaseHas('inspection_reports', ['code' => 'RAP01']);
            $this->assertDatabaseHas('machine_dispatches', ['code' => 'RETIR1']);

            $secondPreview = $this->post('/backend/api/quality/import-preview.php', [
                'csrfToken' => $token,
                'file' => new UploadedFile($path, 'inspecao.xlsx', null, null, true),
            ])->assertCreated();

            $this->assertSame(0, $secondPreview->json('summary.groups.0.added'));
            $this->assertSame(1, $secondPreview->json('summary.groups.0.updated'));
        } finally {
            @unlink($path);
        }
    }

    private function qualityWorkbook(): string
    {
        $workbook = new Spreadsheet;
        $workbook->removeSheetByIndex(0);
        $sheetNames = [
            'REGISTRO DE INSPEÇÃO', 'SAÍDA DE MÁQUINAS', 'REGISTRO DE RECLAMAÇÕES CLIENTE',
            'REGISTRO DE PROBLEMAS START', 'CADASTRO DE COLABORADORES', 'PRODUTOS', 'TABELA DE CÓDIGOS',
        ];
        foreach ($sheetNames as $name) {
            $workbook->createSheet()->setTitle($name);
        }

        $workbook->getSheetByName('TABELA DE CÓDIGOS')->fromArray(['COD 1', 'MONTAGEM INCORRETA'], null, 'B2');
        $workbook->getSheetByName('CADASTRO DE COLABORADORES')->setCellValue('B4', 'Maria Teste');
        $workbook->getSheetByName('PRODUTOS')->setCellValue('B3', 'LASER')->setCellValue('B4', 'MODELO X');
        $workbook->getSheetByName('REGISTRO DE INSPEÇÃO')->fromArray([
            'RAP01', '2026-08-16', 'ago/26', 'RNC', 'Cliente Teste', 'MODELO X', 'LASER', 'B1',
            'QUALIDADE', 'GATE 1', 'MECÂNICO', 'COD 1', 'Descrição da inspeção', 'Maria Teste', '', '', 'NÃO', 'Ação imediata',
        ], null, 'B5');
        $workbook->getSheetByName('SAÍDA DE MÁQUINAS')->fromArray([
            'RETIR1', 'RETIRADA', '2026-08-16', 'ago/26', 'Cliente Teste', 'LASER', 'MODELO X', 'Sem observações',
            'Maria Teste', '', '', 'NÃO', 'Ação imediata', '', '',
        ], null, 'B4');

        $path = tempnam(sys_get_temp_dir(), 'quality-import-').'.xlsx';
        (new Xlsx($workbook))->save($path);
        $workbook->disconnectWorksheets();

        return $path;
    }
}
