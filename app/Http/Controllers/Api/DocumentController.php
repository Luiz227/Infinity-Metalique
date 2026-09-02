<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\User;
use App\Services\WordDocumentBranding;
use App\Support\OnlyOfficeJwt;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

final class DocumentController extends Controller
{
    private const CATEGORIES = ['word', 'pdf', 'foto', 'procedimento', 'mapa', 'diagrama', 'fluxograma', 'organograma', 'outro'];
    private const EDITABLE_EXTENSIONS = ['doc', 'docx', 'pdf'];
    private const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

    public function __construct(private readonly WordDocumentBranding $wordBranding) {}

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $category = trim((string) $request->query('category', ''));

        /** @var User $user */
        $user = $request->user();
        $query = Document::query()
            ->with(['creator:id,name', 'updater:id,name', 'editors:id,name,sector'])
            ->orderBy('sector')
            ->orderByDesc('updated_at');
        if ($search !== '') {
            $query->where(function ($nested) use ($search): void {
                $nested->where('title', 'like', '%'.$search.'%')
                    ->orWhere('original_name', 'like', '%'.$search.'%');
            });
        }
        if (in_array($category, self::CATEGORIES, true)) {
            $query->where('category', $category);
        }

        return response()->json([
            'documents' => $query->get()->map(fn (Document $document): array => $this->serialize($document, $user))->all(),
            'categories' => self::CATEGORIES,
        ])->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function upload(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validated = $request->validate([
            'file' => ['required', 'file', 'max:25600'],
            'title' => ['nullable', 'string', 'max:180'],
            'category' => ['required', 'in:'.implode(',', self::CATEGORIES)],
        ]);
        $file = $request->file('file');
        $extension = strtolower((string) $file?->getClientOriginalExtension());
        if (! in_array($extension, [...self::EDITABLE_EXTENSIONS, ...self::IMAGE_EXTENSIONS], true)) {
            return response()->json(['message' => 'Envie um arquivo Word, PDF ou uma foto JPG, PNG ou WEBP.'], 422);
        }

        $originalName = (string) $file->getClientOriginalName();
        $title = trim((string) ($validated['title'] ?? ''));
        if ($title === '') {
            $title = trim((string) pathinfo($originalName, PATHINFO_FILENAME));
        }
        if ($title === '') {
            return response()->json(['message' => 'Informe um título para o documento.'], 422);
        }

        $path = 'documents/'.now()->format('Y/m').'/'.Str::uuid().'.'.$extension;
        $contents = $file->getContent();
        if (! Storage::disk('local')->put($path, $contents)) {
            return response()->json(['message' => 'Não foi possível armazenar o documento.'], 503);
        }

        $document = null;
        try {
            $document = Document::query()->create([
                'title' => $title,
                'category' => $validated['category'],
                'sector' => trim((string) $user->sector) ?: 'Não informado',
                'original_name' => $originalName,
                'storage_path' => $path,
                'mime_type' => (string) ($file->getMimeType() ?: 'application/octet-stream'),
                'extension' => $extension,
                'size_bytes' => strlen($contents),
                'version' => 1,
                'created_by_user_id' => $user->id,
                'updated_by_user_id' => $user->id,
            ]);

            $this->wordBranding->apply(Storage::disk('local')->path($path), $document, $user);
            $document->forceFill([
                'size_bytes' => Storage::disk('local')->size($path),
                'branded_at' => $extension === 'docx' ? now() : null,
            ])->save();
        } catch (Throwable $error) {
            $document?->delete();
            Storage::disk('local')->delete($path);
            if ($error instanceof RuntimeException) {
                return response()->json(['message' => $error->getMessage()], 422);
            }
            throw $error;
        }

        return response()->json([
            'message' => 'Documento importado com sucesso.',
            'document' => $this->serialize($document->load(['creator:id,name', 'updater:id,name', 'editors:id,name,sector']), $user),
        ], 201);
    }

    public function collaborators(Request $request): JsonResponse
    {
        return response()->json([
            'users' => User::query()
                ->where('is_active', true)
                ->orderBy('sector')
                ->orderBy('name')
                ->get(['id', 'name', 'sector'])
                ->map(static fn (User $user): array => [
                    'id' => (int) $user->id,
                    'name' => (string) $user->name,
                    'sector' => (string) $user->sector,
                ])->all(),
        ])->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function download(Request $request): BinaryFileResponse|JsonResponse
    {
        $document = Document::query()->find($request->integer('id'));
        if (! $document) {
            return response()->json(['message' => 'Documento não encontrado.'], 404);
        }

        $this->ensureWordBranding($document);

        return $this->fileResponse($document, true);
    }

    public function preview(Request $request): BinaryFileResponse|JsonResponse
    {
        $document = Document::query()->find($request->integer('id'));
        if (! $document) {
            return response()->json(['message' => 'Documento não encontrado.'], 404);
        }

        return $this->fileResponse($document, false);
    }

    public function signedFile(Request $request, Document $document): BinaryFileResponse|JsonResponse
    {
        if ((int) $request->query('version', 0) !== (int) $document->version) {
            return response()->json(['message' => 'Esta versão do documento não está mais disponível.'], 410);
        }

        return $this->fileResponse($document, false);
    }

    public function editorConfig(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $document = Document::query()->find($request->integer('id'));
        if (! $document) {
            return response()->json(['message' => 'Documento não encontrado.'], 404);
        }
        if (in_array($document->extension, self::IMAGE_EXTENSIONS, true)) {
            return response()->json(['message' => 'Fotos são visualizadas diretamente na biblioteca de documentos.'], 422);
        }

        $this->ensureWordBranding($document);

        $secret = (string) config('services.onlyoffice.jwt_secret');
        if ($secret === '') {
            return response()->json(['message' => 'O editor de documentos ainda não foi configurado no servidor.'], 503);
        }

        $canEdit = $this->canEdit($user, $document);
        $storageUrl = rtrim((string) config('services.onlyoffice.storage_url'), '/');
        $signedFilePath = URL::temporarySignedRoute('documents.file', now()->addMinutes(20), [
            'document' => $document->id,
            'version' => $document->version,
        ], absolute: false);
        $signedCallbackPath = URL::temporarySignedRoute('documents.callback', now()->addHours(24), [
            'document' => $document->id,
            'version' => $document->version,
        ], absolute: false);
        $config = [
            'document' => [
                'fileType' => $document->extension,
                ...($document->extension === 'pdf' ? ['isForm' => false] : []),
                'key' => $this->documentKey($document),
                'title' => $document->title.'.'.$document->extension,
                'url' => $storageUrl.$signedFilePath,
                'permissions' => [
                    'download' => true,
                    'edit' => $canEdit,
                    'print' => true,
                    'review' => $canEdit,
                ],
            ],
            'documentType' => $document->extension === 'pdf' ? 'pdf' : 'word',
            'editorConfig' => [
                'callbackUrl' => $storageUrl.$signedCallbackPath,
                'lang' => 'pt-BR',
                'mode' => $canEdit ? 'edit' : 'view',
                'user' => ['id' => (string) $user->id, 'name' => (string) $user->name],
                'customization' => [
                    'autosave' => true,
                    'compactHeader' => false,
                    'forcesave' => true,
                ],
            ],
            'height' => '100%',
            'type' => 'desktop',
            'width' => '100%',
        ];
        $config['token'] = OnlyOfficeJwt::encode($config, $secret);

        return response()->json([
            'editorScript' => rtrim((string) config('services.onlyoffice.url'), '/')
                .'/web-apps/apps/api/documents/api.js',
            'config' => $config,
        ])->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function delete(Request $request): JsonResponse
    {
        $document = Document::query()->find($request->integer('id'));
        if (! $document) {
            return response()->json(['message' => 'Documento não encontrado.'], 404);
        }

        /** @var User $user */
        $user = $request->user();
        if (! $this->canDelete($user, $document)) {
            return response()->json(['message' => 'Somente o autor ou um administrador pode excluir este documento.'], 403);
        }

        $path = $document->storage_path;
        DB::transaction(static fn () => $document->delete());
        Storage::disk('local')->delete($path);

        return response()->json(['message' => 'Documento excluído.']);
    }

    public function share(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $document = Document::query()->find($request->integer('id'));
        if (! $document) {
            return response()->json(['message' => 'Documento não encontrado.'], 404);
        }
        if (! $this->canShare($user, $document)) {
            return response()->json(['message' => 'Somente o autor ou um administrador pode autorizar editores.'], 403);
        }

        $validated = $request->validate(['editorIds' => ['array'], 'editorIds.*' => ['integer', 'distinct']]);
        $ids = User::query()
            ->where('is_active', true)
            ->whereIn('id', $validated['editorIds'] ?? [])
            ->whereKeyNot($document->created_by_user_id)
            ->pluck('id')
            ->mapWithKeys(static fn ($id): array => [(int) $id => ['authorized_by_user_id' => $user->id]])
            ->all();
        $document->editors()->sync($ids);

        return response()->json([
            'message' => 'Autorizações atualizadas.',
            'document' => $this->serialize($document->load(['creator:id,name', 'updater:id,name', 'editors:id,name,sector']), $user),
        ]);
    }

    public function forceSave(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $document = Document::query()->find($request->integer('id'));
        if (! $document) {
            return response()->json(['message' => 'Documento não encontrado.'], 404);
        }
        if (! $this->canEdit($user, $document)) {
            return response()->json(['message' => 'Você não possui autorização para salvar este documento.'], 403);
        }

        $secret = (string) config('services.onlyoffice.jwt_secret');
        $command = [
            'c' => 'forcesave',
            'key' => $this->documentKey($document),
            'userdata' => (string) $user->id,
        ];
        $token = OnlyOfficeJwt::encode($command, $secret);
        $response = Http::timeout(20)
            ->withToken($token)
            ->post(rtrim((string) config('services.onlyoffice.internal_url'), '/').'/coauthoring/CommandService.ashx', $command + ['token' => $token])
            ->throw()
            ->json();
        $error = (int) ($response['error'] ?? -1);
        if (! in_array($error, [0, 4], true)) {
            return response()->json(['message' => 'O editor não conseguiu confirmar o salvamento.'], 503);
        }

        return response()->json(['message' => $error === 4 ? 'Não havia alterações pendentes.' : 'Salvamento solicitado.']);
    }

    public function callback(Request $request): JsonResponse
    {
        try {
            $payload = $this->callbackPayload($request);
            $status = (int) ($payload['status'] ?? 0);
            if (! in_array($status, [2, 6], true)) {
                return response()->json(['error' => 0]);
            }

            $document = $this->documentFromKey((string) ($payload['key'] ?? ''));
            $url = (string) ($payload['url'] ?? '');
            $this->assertEditorDownloadUrl($url);
            $response = Http::timeout(90)->get($this->internalEditorUrl($url))->throw();
            $contents = $response->body();
            if ($contents === '' || strlen($contents) > 25 * 1024 * 1024) {
                throw new RuntimeException('O arquivo salvo pelo editor possui tamanho inválido.');
            }

            if (! Storage::disk('local')->put($document->storage_path, $contents)) {
                throw new RuntimeException('Não foi possível gravar o arquivo devolvido pelo editor.');
            }

            $changes = ['size_bytes' => strlen($contents)];
            // O status 6 é um salvamento forçado durante a mesma sessão. A chave
            // só muda no status 2, quando todos fecharam o editor; caso contrário
            // o próximo autosave da mesma sessão pareceria uma edição antiga.
            if ($status === 2) {
                $changes['version'] = (int) $document->version + 1;
            }
            $editorUserId = (int) (($payload['users'][0] ?? 0));
            if ($editorUserId > 0 && User::query()->whereKey($editorUserId)->exists()) {
                $changes['updated_by_user_id'] = $editorUserId;
            }
            $document->forceFill($changes)->save();

            return response()->json(['error' => 0]);
        } catch (ConnectionException|RuntimeException $error) {
            report($error);

            return response()->json(['error' => 1]);
        } catch (Throwable $error) {
            report($error);

            return response()->json(['error' => 1]);
        }
    }

    /** @return array<string, mixed> */
    private function callbackPayload(Request $request): array
    {
        $token = $request->bearerToken() ?: (string) $request->input('token', '');
        if ($token !== '') {
            return OnlyOfficeJwt::decode($token, (string) config('services.onlyoffice.jwt_secret'));
        }

        if (! URL::hasValidSignature($request, absolute: false)) {
            throw new RuntimeException('O editor não enviou uma assinatura válida para o salvamento.');
        }

        return $request->except(['signature', 'expires']);
    }

    private function internalEditorUrl(string $url): string
    {
        $this->assertEditorDownloadUrl($url);
        $public = rtrim((string) config('services.onlyoffice.url'), '/');
        $internal = rtrim((string) config('services.onlyoffice.internal_url'), '/');
        if ($public !== '' && $internal !== '' && str_starts_with($url, $public.'/')) {
            return $internal.substr($url, strlen($public));
        }

        return $url;
    }

    private function documentFromKey(string $key): Document
    {
        if (! preg_match('/^document-(\d+)-v(\d+)(?:-pdf-editor)?$/', $key, $matches)) {
            throw new RuntimeException('Documento do editor inválido.');
        }

        $document = Document::query()->find((int) $matches[1]);
        if (! $document || (int) $document->version !== (int) $matches[2]) {
            throw new RuntimeException('A versão editada não corresponde ao documento atual.');
        }

        return $document;
    }

    private function assertEditorDownloadUrl(string $url): void
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $allowed = array_filter([
            strtolower((string) parse_url((string) config('services.onlyoffice.url'), PHP_URL_HOST)),
            strtolower((string) parse_url((string) config('services.onlyoffice.internal_url'), PHP_URL_HOST)),
        ]);
        if ($host === '' || ! in_array($host, $allowed, true)) {
            throw new RuntimeException('O editor devolveu um endereço de arquivo não autorizado.');
        }
    }

    private function fileResponse(Document $document, bool $download): BinaryFileResponse|JsonResponse
    {
        $path = Storage::disk('local')->path($document->storage_path);
        if (! is_file($path)) {
            return response()->json(['message' => 'O arquivo deste documento não foi encontrado.'], 404);
        }

        $name = Str::slug($document->title) ?: 'documento';
        $headers = ['Content-Type' => $document->mime_type ?: 'application/octet-stream'];

        return $download
            ? response()->download($path, $name.'.'.$document->extension, $headers)
            : response()->file($path, $headers);
    }

    /** @return array<string, mixed> */
    private function serialize(Document $document, User $user): array
    {
        return [
            'id' => (int) $document->id,
            'title' => (string) $document->title,
            'category' => (string) $document->category,
            'sector' => (string) $document->sector,
            'originalName' => (string) $document->original_name,
            'extension' => (string) $document->extension,
            'sizeBytes' => (int) $document->size_bytes,
            'version' => (int) $document->version,
            'kind' => in_array($document->extension, self::IMAGE_EXTENSIONS, true) ? 'image' : ($document->extension === 'pdf' ? 'pdf' : 'word'),
            'canEdit' => $this->canEdit($user, $document),
            'canDelete' => $this->canDelete($user, $document),
            'canShare' => $this->canShare($user, $document),
            'authorizedEditorIds' => $document->editors->pluck('id')->map(static fn ($id): int => (int) $id)->values()->all(),
            'createdById' => (int) $document->created_by_user_id,
            'createdBy' => $document->creator?->name,
            'updatedBy' => $document->updater?->name,
            'createdAt' => $document->created_at?->toIso8601String(),
            'updatedAt' => $document->updated_at?->toIso8601String(),
        ];
    }

    private function documentKey(Document $document): string
    {
        return 'document-'.$document->id.'-v'.$document->version
            .($document->extension === 'pdf' ? '-pdf-editor' : '');
    }

    private function canEdit(User $user, Document $document): bool
    {
        return (int) $document->created_by_user_id === (int) $user->id
            || $user->hasPermission('documents.manage')
            || $document->editors()->whereKey($user->id)->exists();
    }

    private function canDelete(User $user, Document $document): bool
    {
        return (int) $document->created_by_user_id === (int) $user->id
            || $user->hasPermission('documents.manage');
    }

    private function canShare(User $user, Document $document): bool
    {
        return $this->canDelete($user, $document);
    }

    private function ensureWordBranding(Document $document): void
    {
        if ($document->extension !== 'docx' || $document->branded_at !== null) {
            return;
        }

        $creator = User::query()->find($document->created_by_user_id);
        if (! $creator) {
            return;
        }

        $this->wordBranding->apply(Storage::disk('local')->path($document->storage_path), $document, $creator);
        $document->forceFill([
            'size_bytes' => Storage::disk('local')->size($document->storage_path),
            'version' => (int) $document->version + 1,
            'branded_at' => now(),
        ])->save();
    }
}
