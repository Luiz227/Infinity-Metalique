<?php

declare(strict_types=1);

namespace Tests\Feature\Api;

use App\Models\Document;
use App\Models\User;
use App\Support\OnlyOfficeJwt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;
use ZipArchive;

final class DocumentApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        config()->set('services.onlyoffice.url', 'https://infinity.example.com/onlyoffice');
        config()->set('services.onlyoffice.internal_url', 'http://onlyoffice');
        config()->set('services.onlyoffice.storage_url', 'https://infinity.example.com');
        config()->set('services.onlyoffice.jwt_secret', 'segredo-de-teste-com-32-caracteres');
        config()->set('app.url', 'https://infinity.example.com');
    }

    public function test_gestor_importa_lista_e_baixa_documento_word(): void
    {
        $manager = $this->userWithPermission('documents.manage');
        $this->actingAs($manager);
        $csrf = $this->csrf();

        $response = $this->post('/backend/api/documents/upload.php', [
            'csrfToken' => $csrf,
            'title' => 'Procedimento de inspeção',
            'category' => 'procedimento',
            'file' => UploadedFile::fake()->createWithContent('procedimento.docx', $this->minimalDocx()),
        ])->assertCreated();

        $id = (int) $response->json('document.id');
        $this->assertSame('Procedimento de inspeção', $response->json('document.title'));
        $this->assertDatabaseHas('documents', ['id' => $id, 'created_by_user_id' => $manager->id]);
        $document = Document::query()->findOrFail($id);
        Storage::disk('local')->assertExists((string) $document->storage_path);
        $this->assertSame($manager->sector, $document->sector);
        $this->assertNotNull($document->branded_at);
        $this->assertDocxIsBranded(Storage::disk('local')->path($document->storage_path));

        $this->getJson('/backend/api/documents/index.php')
            ->assertOk()
            ->assertJsonPath('documents.0.id', $id);
        $this->get('/backend/api/documents/download.php?id='.$id)
            ->assertOk()
            ->assertDownload('procedimento-de-inspecao.docx');
    }

    public function test_visualizador_importa_no_proprio_setor_mas_nao_exclui_documento_alheio(): void
    {
        $document = $this->document();
        $viewer = $this->userWithPermission('documents.view');
        $this->actingAs($viewer);
        $csrf = $this->csrf();

        $this->getJson('/backend/api/documents/index.php')->assertOk();
        $this->post('/backend/api/documents/upload.php', [
            'csrfToken' => $csrf,
            'category' => 'outro',
            'file' => UploadedFile::fake()->createWithContent('arquivo.pdf', '%PDF-1.7 teste'),
        ])->assertCreated()->assertJsonPath('document.sector', $viewer->sector);
        $this->postJson('/backend/api/documents/delete.php', ['csrfToken' => $csrf, 'id' => $document->id])
            ->assertForbidden();
        $this->assertDatabaseHas('documents', ['id' => $document->id]);
    }

    public function test_gestor_importa_pdf_e_abre_no_editor_de_pdf(): void
    {
        $manager = $this->userWithPermission('documents.manage');
        $this->actingAs($manager);
        $csrf = $this->csrf();

        $upload = $this->post('/backend/api/documents/upload.php', [
            'csrfToken' => $csrf,
            'title' => 'Manual em PDF',
            'category' => 'procedimento',
            'file' => UploadedFile::fake()->createWithContent('manual.pdf', '%PDF-1.7 teste'),
        ])->assertCreated();

        $id = (int) $upload->json('document.id');
        $this->assertSame('pdf', $upload->json('document.extension'));

        $editor = $this->getJson('/backend/api/documents/editor-config.php?id='.$id)->assertOk();
        $this->assertSame('pdf', $editor->json('config.document.fileType'));
        $this->assertFalse($editor->json('config.document.isForm'));
        $this->assertSame('document-'.$id.'-v1-pdf-editor', $editor->json('config.document.key'));
        $this->assertSame('pdf', $editor->json('config.documentType'));
        $this->assertSame('edit', $editor->json('config.editorConfig.mode'));
        $this->assertTrue($editor->json('config.document.permissions.edit'));
    }

    public function test_editor_configura_leitura_e_edicao_conforme_permissao(): void
    {
        $document = $this->document();
        $viewer = $this->userWithPermission('documents.view');
        $this->actingAs($viewer);
        $view = $this->getJson('/backend/api/documents/editor-config.php?id='.$document->id)->assertOk();
        $this->assertSame('view', $view->json('config.editorConfig.mode'));
        $this->assertFalse($view->json('config.document.permissions.edit'));
        $this->assertStringContainsString('/onlyoffice/web-apps/apps/api/documents/api.js', $view->json('editorScript'));
        $this->get($view->json('config.document.url'))->assertOk();

        $manager = $this->userWithPermission('documents.manage');
        $this->actingAs($manager);
        $edit = $this->getJson('/backend/api/documents/editor-config.php?id='.$document->id)->assertOk();
        $this->assertSame('edit', $edit->json('config.editorConfig.mode'));
        $this->assertTrue($edit->json('config.document.permissions.edit'));
        $this->assertSame('word', $edit->json('config.documentType'));
        $this->assertNotEmpty($edit->json('config.token'));

        $authorized = $this->userWithPermission('documents.view');
        DB::table('document_editors')->insert([
            'document_id' => $document->id,
            'user_id' => $authorized->id,
            'authorized_by_user_id' => $document->created_by_user_id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->actingAs($authorized);
        $this->getJson('/backend/api/documents/editor-config.php?id='.$document->id)
            ->assertOk()
            ->assertJsonPath('config.editorConfig.mode', 'edit');
    }

    public function test_autor_autoriza_outro_usuario_a_editar(): void
    {
        $owner = $this->userWithPermission('documents.view');
        $editor = $this->userWithPermission('documents.view');
        $document = $this->document($owner);
        $this->actingAs($owner);

        $response = $this->postJson('/backend/api/documents/share.php', [
            'csrfToken' => $this->csrf(),
            'id' => $document->id,
            'editorIds' => [$editor->id],
        ])->assertOk();

        $response->assertJsonPath('document.authorizedEditorIds.0', $editor->id);
        $this->assertDatabaseHas('document_editors', ['document_id' => $document->id, 'user_id' => $editor->id]);
    }

    public function test_foto_e_organizada_e_visualizada_sem_onlyoffice(): void
    {
        $user = $this->userWithPermission('documents.view');
        $this->actingAs($user);
        $upload = $this->post('/backend/api/documents/upload.php', [
            'csrfToken' => $this->csrf(),
            'category' => 'foto',
            'file' => UploadedFile::fake()->createWithContent('inspecao.jpg', "\xFF\xD8\xFF\xE0imagem-teste"),
        ])->assertCreated();

        $id = (int) $upload->json('document.id');
        $upload->assertJsonPath('document.kind', 'image');
        $this->get('/backend/api/documents/preview.php?id='.$id)->assertOk();
        $this->getJson('/backend/api/documents/editor-config.php?id='.$id)->assertUnprocessable();
    }

    public function test_salvamento_forcado_envia_comando_assinado(): void
    {
        $owner = $this->userWithPermission('documents.view');
        $document = $this->document($owner);
        $this->actingAs($owner);
        Http::fake(['http://onlyoffice/coauthoring/CommandService.ashx' => Http::response(['error' => 0])]);

        $this->postJson('/backend/api/documents/force-save.php', [
            'csrfToken' => $this->csrf(),
            'id' => $document->id,
        ])->assertOk();

        Http::assertSent(static fn ($request): bool => $request['c'] === 'forcesave'
            && $request['key'] === 'document-'.$document->id.'-v1'
            && is_string($request['token']));
    }

    public function test_callback_autenticado_substitui_arquivo_e_fecha_versao(): void
    {
        $editor = User::factory()->create();
        $document = $this->document();
        Http::fake(['http://onlyoffice/*' => Http::response('nova-versao-word', 200)]);
        $token = OnlyOfficeJwt::encode([
            'status' => 2,
            'key' => 'document-'.$document->id.'-v1',
            'url' => 'http://onlyoffice/cache/documento.docx',
            'users' => [(string) $editor->id],
        ], (string) config('services.onlyoffice.jwt_secret'));

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/backend/api/documents/callback.php')
            ->assertOk()
            ->assertJson(['error' => 0]);

        $document->refresh();
        $this->assertSame(2, (int) $document->version);
        $this->assertSame($editor->id, (int) $document->updated_by_user_id);
        $this->assertSame('nova-versao-word', Storage::disk('local')->get($document->storage_path));
    }

    public function test_callback_recusa_token_e_endereco_nao_autorizados(): void
    {
        $document = $this->document();
        $this->postJson('/backend/api/documents/callback.php')->assertOk()->assertJson(['error' => 1]);

        $token = OnlyOfficeJwt::encode([
            'status' => 2,
            'key' => 'document-'.$document->id.'-v1',
            'url' => 'http://169.254.169.254/latest/meta-data',
        ], (string) config('services.onlyoffice.jwt_secret'));
        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/backend/api/documents/callback.php')
            ->assertOk()
            ->assertJson(['error' => 1]);
        $this->assertSame(1, (int) $document->fresh()->version);
    }

    public function test_callback_aceita_url_assinada_quando_editor_nao_envia_token(): void
    {
        $document = $this->document();
        Http::fake(['http://onlyoffice/*' => Http::response('versao-assinada', 200)]);
        $path = URL::temporarySignedRoute('documents.callback', now()->addHour(), [
            'document' => $document->id,
            'version' => 1,
        ], absolute: false);

        $this->postJson($path, [
            'status' => 6,
            'key' => 'document-'.$document->id.'-v1',
            'url' => 'http://onlyoffice/cache/documento.docx',
            'users' => [(string) $document->created_by_user_id],
        ])->assertOk()->assertJson(['error' => 0]);

        $this->assertSame('versao-assinada', Storage::disk('local')->get($document->storage_path));
    }

    private function csrf(): string
    {
        return (string) $this->getJson('/backend/api/csrf.php')->json('csrfToken');
    }

    private function userWithPermission(string $permission): User
    {
        $user = User::factory()->create(['role' => 'user']);
        DB::table('user_permissions')->insert(['user_id' => $user->id, 'permission' => $permission]);

        return $user;
    }

    private function document(?User $owner = null): Document
    {
        $owner ??= User::factory()->create();
        $path = 'documents/teste/documento.docx';
        Storage::disk('local')->put($path, $this->minimalDocx());

        return Document::query()->create([
            'title' => 'Documento de teste',
            'category' => 'procedimento',
            'sector' => $owner->sector,
            'original_name' => 'documento.docx',
            'storage_path' => $path,
            'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'extension' => 'docx',
            'size_bytes' => Storage::disk('local')->size($path),
            'version' => 1,
            'created_by_user_id' => $owner->id,
            'updated_by_user_id' => $owner->id,
        ]);
    }

    private function minimalDocx(): string
    {
        $path = tempnam(sys_get_temp_dir(), 'infinity-docx-');
        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
        $zip->addFromString('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
        $zip->addFromString('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>Conteúdo de teste</w:t></w:r></w:p><w:sectPr/></w:body></w:document>');
        $zip->close();
        $contents = (string) file_get_contents($path);
        unlink($path);

        return $contents;
    }

    private function assertDocxIsBranded(string $path): void
    {
        $zip = new ZipArchive();
        $this->assertTrue($zip->open($path) === true);
        $this->assertNotFalse($zip->locateName('word/headerInfinity.xml'));
        $this->assertNotFalse($zip->locateName('word/footerInfinity.xml'));
        $this->assertStringContainsString('Metalique Infinity', (string) $zip->getFromName('word/headerInfinity.xml'));
        $zip->close();
    }
}
