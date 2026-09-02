<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\User;
use App\Services\QualityService;
use App\Support\QualityRevision;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

final class QualityApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_revisao_muda_ao_criar_e_excluir_coleta(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        $machineTypeId = DB::table('machine_types')->insertGetId(['name' => 'LASER']);
        $quality = app(QualityService::class);

        $dispatch = $quality->createDispatch([
            'dispatchDate' => '2026-08-20',
            'client' => 'Cliente Teste',
            'machineTypeId' => $machineTypeId,
            'model' => 'Modelo 1',
            'notes' => null,
            'needsFormUpdate' => false,
            'formChange' => null,
            'immediateAction' => null,
            'employeeIds' => [],
        ], ['dispatches/frente.webp', 'dispatches/lateral.webp'], (int) $user->id);

        $this->assertSame('1', QualityRevision::current());
        $this->assertNotNull($quality->deleteDispatch((int) $dispatch['id']));
        $this->assertSame('2', QualityRevision::current());
        $this->assertNull($quality->deleteDispatch((int) $dispatch['id']));
        $this->assertSame('2', QualityRevision::current());
    }

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

        $this->getJson('/backend/api/quality/revision.php')
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=0, no-store, private')
            ->assertJsonPath('revision', '0');

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
        $this->getJson('/backend/api/quality/revision.php')->assertJsonPath('revision', '1');
    }

    public function test_cria_e_exclui_registro_de_satisfacao_pela_api(): void
    {
        $machineTypeId = DB::table('machine_types')->insertGetId(['name' => 'LASER']);
        $payload = [
            'complaintDate' => '2026-08-20',
            'client' => 'Cliente Teste',
            'machineTypeId' => $machineTypeId,
            'model' => 'Modelo 1',
            'problem' => 'A máquina chegou com a lataria amassada.',
            'localTreatment' => 'Peça reposta pelo técnico da região.',
            'qualityAlert' => 'ALERTA 7',
        ];

        // Sem a permissão de criação, o endpoint não deve nem chegar no serviço.
        $visitante = User::factory()->create(['role' => 'user']);
        DB::table('user_permissions')->insert(['user_id' => $visitante->id, 'permission' => 'quality.satisfaction']);
        $this->actingAs($visitante);
        $tokenVisitante = $this->getJson('/backend/api/csrf.php')->json('csrfToken');
        $this->postJson('/backend/api/quality/complaint-create.php', ['csrfToken' => $tokenVisitante] + $payload)
            ->assertForbidden();

        $user = User::factory()->create(['role' => 'admin']);
        $this->actingAs($user);
        $token = $this->getJson('/backend/api/csrf.php')->json('csrfToken');

        $id = $this->postJson('/backend/api/quality/complaint-create.php', ['csrfToken' => $token] + $payload)
            ->assertCreated()
            ->assertJsonPath('complaint.code', 'RSC01')
            ->json('complaint.id');
        $this->getJson('/backend/api/quality/revision.php')->assertJsonPath('revision', '1');

        // source_key nulo é o que impede a reimportação da planilha de
        // sobrescrever o registro lançado à mão.
        $this->assertDatabaseHas('customer_complaints', [
            'code' => 'RSC01', 'sequence' => 1, 'created_by_user_id' => $user->id, 'source_key' => null,
        ]);

        $this->getJson("/backend/api/quality/complaint.php?id={$id}")
            ->assertOk()
            ->assertJsonPath('complaint.client', 'Cliente Teste')
            ->assertJsonPath('complaint.machine_type', 'LASER')
            ->assertJsonPath('complaint.created_by', $user->name);

        $this->postJson('/backend/api/quality/complaint-delete.php', ['csrfToken' => $token, 'id' => $id])
            ->assertOk()
            ->assertJsonPath('code', 'RSC01');

        $this->assertDatabaseMissing('customer_complaints', ['id' => $id]);
        $this->getJson('/backend/api/quality/revision.php')->assertJsonPath('revision', '2');
    }

    public function test_lista_satisfacoes_paginadas_e_filtradas(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        $this->actingAs($user);
        $machineTypeId = DB::table('machine_types')->insertGetId(['name' => 'LASER']);
        $quality = app(QualityService::class);

        foreach (['2025-03-10', '2026-08-01', '2026-08-20'] as $index => $date) {
            $quality->createComplaint([
                'complaintDate' => $date,
                'client' => 'Cliente '.($index + 1),
                'machineTypeId' => $machineTypeId,
                'model' => 'Modelo 1',
                'problem' => 'Ocorrência '.($index + 1),
                'localTreatment' => null,
                'qualityAlert' => null,
            ], (int) $user->id);
        }

        // Página 2 de uma por vez: a segunda mais recente, e o total é do
        // conjunto inteiro - não da página.
        $this->getJson('/backend/api/quality/complaints.php?perPage=1&page=2')
            ->assertOk()
            ->assertJsonPath('total', 3)
            ->assertJsonPath('page', 2)
            ->assertJsonPath('perPage', 1)
            ->assertJsonCount(1, 'items')
            ->assertJsonPath('items.0.complaint_date', '2026-08-01')
            ->assertJsonPath('items.0.machine_type', 'LASER');

        // O mesmo recorte da barra de filtros vale aqui.
        $this->getJson('/backend/api/quality/complaints.php?endDate=2025-12-31')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('items.0.complaint_date', '2025-03-10');

        // Sem permissão de qualidade o endpoint não responde.
        $visitante = User::factory()->create(['role' => 'user']);
        $this->actingAs($visitante);
        $this->getJson('/backend/api/quality/complaints.php')->assertForbidden();
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
            $this->getJson('/backend/api/quality/revision.php')->assertJsonPath('revision', '0');

            $this->postJson('/backend/api/quality/import-confirm.php', [
                'csrfToken' => $token,
                'token' => $preview->json('token'),
            ])->assertOk()->assertJsonPath('message', 'Planilha importada com sucesso.');
            $this->getJson('/backend/api/quality/revision.php')->assertJsonPath('revision', '1');

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

    public function test_exporta_dados_da_qualidade_em_planilha(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        $machineTypeId = DB::table('machine_types')->insertGetId(['name' => 'LASER']);
        $qualityCodeId = DB::table('quality_codes')->insertGetId([
            'code' => 'COD 1', 'description' => 'Montagem incorreta', 'position' => 1,
        ]);
        $employeeId = DB::table('employees')->insertGetId([
            'name' => 'Maria Teste',
            'normalized_name' => 'MARIA TESTE',
            'is_active' => true,
            'created_at' => now(),
        ]);
        $quality = app(QualityService::class);
        $quality->createReport([
            'reportDate' => '2026-08-13',
            'actionType' => 'RNC',
            'client' => 'Cliente Teste',
            'machineTypeId' => $machineTypeId,
            'model' => 'Modelo 1',
            'shed' => 'B1',
            'sector' => 'QUALIDADE',
            'gate' => 'GATE 1',
            'problemType' => 'MECÃ‚NICO',
            'qualityCodeId' => $qualityCodeId,
            'description' => 'DescriÃ§Ã£o completa do problema.',
            'needsChecklistUpdate' => false,
            'checklistChange' => null,
            'immediateAction' => 'AÃ§Ã£o imediata',
            'employeeIds' => [$employeeId],
        ], (int) $user->id);

        $this->actingAs($user);
        $response = $this->get('/backend/api/quality/export.php?datasets=reports,catalogs')
            ->assertOk();

        $path = tempnam(sys_get_temp_dir(), 'quality-export-test-').'.xlsx';
        file_put_contents($path, $response->streamedContent());

        try {
            $workbook = IOFactory::load($path);
            $this->assertSame(['RAPs', 'Catalogos - Codigos', 'Catalogos - Colaboradores', 'Catalogos - Produtos', 'Catalogos - Clientes'], $workbook->getSheetNames());
            $this->assertSame('RAP01', $workbook->getSheetByName('RAPs')?->getCell('A2')->getValue());
            $this->assertSame('Maria Teste', $workbook->getSheetByName('RAPs')?->getCell('Q2')->getValue());
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
