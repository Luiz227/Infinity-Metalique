<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\QualityExportService;
use App\Services\QualityImportService;
use App\Services\QualityService;
use App\Services\UploadService;
use App\Support\QualityRevision;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use RuntimeException;

final class QualityController extends Controller
{
    public function revision(): JsonResponse
    {
        try {
            return response()
                ->json(['revision' => QualityRevision::current()])
                ->header('Cache-Control', 'private, no-store, max-age=0');
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível verificar atualizações da Qualidade.'], 503);
        }
    }

    public function importPreview(Request $request, QualityImportService $imports): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $request->validate(['file' => ['required', 'file', 'max:15360']]);

        try {
            return response()->json($imports->preview($request->file('file'), (int) $user->id), 201);
        } catch (RuntimeException $error) {
            return response()->json(['message' => $error->getMessage()], 422);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível preparar a importação no banco de dados.'], 503);
        }
    }

    public function importConfirm(Request $request, QualityImportService $imports): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $token = trim((string) $request->input('token', ''));
        if ($token === '') {
            return response()->json(['message' => 'Gere uma prévia antes de confirmar a importação.'], 422);
        }

        try {
            return response()->json($imports->confirm($token, (int) $user->id));
        } catch (RuntimeException $error) {
            return response()->json(['message' => $error->getMessage()], 422);
        } catch (QueryException) {
            return response()->json(['message' => 'A importação não pôde ser concluída. Nenhum dado foi alterado.'], 503);
        }
    }

    public function importHistory(QualityImportService $imports): JsonResponse
    {
        try {
            return response()->json(['items' => $imports->history()]);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar o histórico de importações.'], 503);
        }
    }

    public function export(Request $request, QualityService $quality, QualityExportService $exports)
    {
        /** @var User $user */
        $user = $request->user();
        $requested = $request->query('datasets', 'all');
        $datasets = is_string($requested)
            ? array_values(array_filter(array_map('trim', explode(',', $requested))))
            : [];
        if ($datasets === [] || in_array('all', $datasets, true)) {
            $datasets = QualityExportService::DATASETS;
        }

        $allowed = $this->exportableDatasets($user);
        $datasets = array_values(array_intersect($datasets, $allowed));
        if ($datasets === []) {
            return response()->json(['message' => 'VocÃª nÃ£o tem permissÃ£o para exportar estes dados.'], 403);
        }

        try {
            $path = $exports->export($datasets, $quality->filters($request->query()));
        } catch (InvalidArgumentException $error) {
            return response()->json(['message' => $error->getMessage()], 422);
        } catch (QueryException) {
            return response()->json(['message' => 'NÃ£o foi possÃ­vel exportar os dados da Qualidade.'], 503);
        }

        $filename = 'qualidade-'.now()->format('Ymd-His').'.xlsx';

        return response()->download($path, $filename)->deleteFileAfterSend(true);
    }

    /** @return list<string> */
    private function exportableDatasets(User $user): array
    {
        if ($user->role === 'admin') {
            return QualityExportService::DATASETS;
        }

        $permissions = $user->permissionKeys();
        $datasets = [];
        if (array_intersect($permissions, ['quality.raps', 'quality.units', 'quality.products', 'quality.employees', 'quality.records'])) {
            $datasets[] = 'reports';
        }
        if (array_intersect($permissions, ['quality.dispatches', 'quality.products', 'quality.employees', 'quality.records'])) {
            $datasets[] = 'dispatches';
        }
        if (array_intersect($permissions, ['quality.satisfaction', 'quality.records'])) {
            $datasets[] = 'complaints';
        }
        if (in_array('quality.create_complaint', $permissions, true)) {
            $datasets[] = 'plans';
        }
        if (in_array('quality.import', $permissions, true) || in_array('quality.manage', $permissions, true)) {
            $datasets[] = 'catalogs';
        }

        return array_values(array_unique($datasets));
    }

    public function options(QualityService $quality): JsonResponse
    {
        try {
            return response()->json($quality->options());
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar as listas do setor de qualidade.'], 503);
        }
    }

    public function dashboard(Request $request, QualityService $quality): JsonResponse
    {
        $filters = $quality->filters($request->query());
        try {
            return response()->json(['filters' => $filters] + $quality->dashboard($filters));
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar os indicadores da qualidade.'], 503);
        }
    }

    public function reports(Request $request, QualityService $quality): JsonResponse
    {
        try {
            return response()->json($quality->reports(
                $quality->filters($request->query()),
                $request->integer('page', 1),
                $request->integer('perPage', 25)
            ));
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar os apontamentos.'], 503);
        }
    }

    public function report(Request $request, QualityService $quality): JsonResponse
    {
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe o apontamento desejado.'], 422);
        }
        try {
            $report = $quality->findReport($id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar o apontamento.'], 503);
        }

        return $report === null
            ? response()->json(['message' => 'Apontamento não encontrado.'], 404)
            : response()->json(['report' => $report]);
    }

    public function dispatches(Request $request, QualityService $quality): JsonResponse
    {
        try {
            return response()->json($quality->dispatches(
                $quality->filters($request->query()),
                $request->integer('page', 1),
                $request->integer('perPage', 25)
            ));
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar as coletas.'], 503);
        }
    }

    public function dispatch(Request $request, QualityService $quality): JsonResponse
    {
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe a coleta desejada.'], 422);
        }
        try {
            $dispatch = $quality->findDispatch($id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar a coleta.'], 503);
        }

        return $dispatch === null
            ? response()->json(['message' => 'Coleta não encontrada.'], 404)
            : response()->json(['dispatch' => $dispatch]);
    }

    public function complaints(Request $request, QualityService $quality): JsonResponse
    {
        try {
            return response()->json($quality->complaints(
                $quality->filters($request->query()),
                $request->integer('page', 1),
                $request->integer('perPage', 25)
            ));
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar os registros de satisfação.'], 503);
        }
    }

    public function complaint(Request $request, QualityService $quality): JsonResponse
    {
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe o registro desejado.'], 422);
        }
        try {
            $complaint = $quality->findComplaint($id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar o registro de satisfação.'], 503);
        }

        return $complaint === null
            ? response()->json(['message' => 'Registro de satisfação não encontrado.'], 404)
            : response()->json(['complaint' => $complaint]);
    }

    public function createReport(Request $request, QualityService $quality): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validation = $quality->validateReport($request->all());
        if (! $validation['success']) {
            return response()->json(['message' => $validation['message']], 422);
        }
        try {
            $report = $quality->createReport($validation['data'], (int) $user->id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível gravar o apontamento.'], 503);
        }

        return response()->json(['message' => 'Apontamento registrado com sucesso.', 'report' => $report], 201);
    }

    public function createDispatch(
        Request $request,
        QualityService $quality,
        UploadService $uploads
    ): JsonResponse {
        /** @var User $user */
        $user = $request->user();
        $validation = $quality->validateDispatch($request->all());
        if (! $validation['success']) {
            return response()->json(['message' => $validation['message']], 422);
        }

        $files = $request->file('photos', []);
        $files = is_array($files) ? array_values($files) : [$files];
        if (count($files) < 2) {
            return response()->json(['message' => 'Envie pelo menos duas fotos do carregamento.'], 422);
        }
        if (count($files) > 6) {
            return response()->json(['message' => 'Envie no máximo seis fotos por coleta.'], 422);
        }

        $paths = [];
        try {
            foreach ($files as $file) {
                $paths[] = $uploads->storeImage($file, 'dispatches');
            }
        } catch (RuntimeException $error) {
            $uploads->remove($paths);

            return response()->json(['message' => $error->getMessage()], 422);
        }

        try {
            $dispatch = $quality->createDispatch($validation['data'], $paths, (int) $user->id);
        } catch (QueryException) {
            $uploads->remove($paths);

            return response()->json(['message' => 'Não foi possível gravar a coleta.'], 503);
        }

        return response()->json(['message' => 'Coleta registrada com sucesso.', 'dispatch' => $dispatch], 201);
    }

    public function createComplaint(Request $request, QualityService $quality): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validation = $quality->validateComplaint($request->all());
        if (! $validation['success']) {
            return response()->json(['message' => $validation['message']], 422);
        }
        try {
            $complaint = $quality->createComplaint($validation['data'], (int) $user->id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível gravar o registro de satisfação.'], 503);
        }

        return response()->json([
            'message' => 'Registro de satisfação gravado com sucesso.',
            'complaint' => $complaint,
        ], 201);
    }

    public function updateReport(Request $request, QualityService $quality): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe um RAP válido.'], 422);
        }

        $validation = $quality->validateReport($request->all(), $id);
        if (! $validation['success']) {
            return response()->json(['message' => $validation['message']], 422);
        }

        try {
            $result = $quality->updateReport($id, $validation['data'], (int) $user->id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível atualizar o RAP.'], 503);
        }
        if ($result === null) {
            return response()->json(['message' => 'RAP não encontrado.'], 404);
        }

        $code = (string) ($result['report']['code'] ?? 'RAP');

        return response()->json([
            'message' => $result['changed']
                ? "{$code} atualizado com sucesso."
                : 'Nenhuma alteração foi necessária.',
            'report' => $result['report'],
        ]);
    }

    public function updateDispatch(
        Request $request,
        QualityService $quality,
        UploadService $uploads
    ): JsonResponse {
        /** @var User $user */
        $user = $request->user();
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe um RETIR válido.'], 422);
        }

        $validation = $quality->validateDispatch($request->all());
        if (! $validation['success']) {
            return response()->json(['message' => $validation['message']], 422);
        }

        $kept = $request->input('keptPhotos', []);
        $kept = is_array($kept) ? $kept : [$kept];
        $kept = array_values(array_unique(array_filter(
            array_map(static fn (mixed $path): string => trim((string) $path), $kept),
            static fn (string $path): bool => $path !== ''
        )));
        $files = $request->file('photos', []);
        $files = is_array($files) ? array_values($files) : [$files];
        $totalPhotos = count($kept) + count($files);
        if ($totalPhotos < 2 || $totalPhotos > 6) {
            return response()->json(['message' => 'Mantenha entre duas e seis fotos do carregamento.'], 422);
        }

        $newPaths = [];
        try {
            foreach ($files as $file) {
                $newPaths[] = $uploads->storeImage($file, 'dispatches');
            }
        } catch (RuntimeException $error) {
            $uploads->remove($newPaths);

            return response()->json(['message' => $error->getMessage()], 422);
        }

        try {
            $result = $quality->updateDispatch(
                $id,
                $validation['data'],
                $kept,
                $newPaths,
                (int) $user->id
            );
        } catch (InvalidArgumentException $error) {
            $uploads->remove($newPaths);

            return response()->json(['message' => $error->getMessage()], 422);
        } catch (QueryException) {
            $uploads->remove($newPaths);

            return response()->json(['message' => 'Não foi possível atualizar o RETIR.'], 503);
        }
        if ($result === null) {
            $uploads->remove($newPaths);

            return response()->json(['message' => 'RETIR não encontrado.'], 404);
        }

        // Os arquivos novos já estavam no disco antes da transação. Os antigos
        // só saem depois do commit, para um rollback nunca deixar caminhos
        // gravados sem o respectivo arquivo.
        $uploads->remove($result['removedPhotos']);
        $code = (string) ($result['dispatch']['code'] ?? 'RETIR');

        return response()->json([
            'message' => $result['changed']
                ? "{$code} atualizado com sucesso."
                : 'Nenhuma alteração foi necessária.',
            'dispatch' => $result['dispatch'],
        ]);
    }

    public function updateComplaint(Request $request, QualityService $quality): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe um RSC válido.'], 422);
        }

        $validation = $quality->validateComplaint($request->all());
        if (! $validation['success']) {
            return response()->json(['message' => $validation['message']], 422);
        }

        try {
            $result = $quality->updateComplaint($id, $validation['data'], (int) $user->id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível atualizar o RSC.'], 503);
        }
        if ($result === null) {
            return response()->json(['message' => 'RSC não encontrado.'], 404);
        }

        $code = (string) ($result['complaint']['code'] ?? 'RSC');

        return response()->json([
            'message' => $result['changed']
                ? "{$code} atualizado com sucesso."
                : 'Nenhuma alteração foi necessária.',
            'complaint' => $result['complaint'],
        ]);
    }

    public function deleteReport(Request $request, QualityService $quality): JsonResponse
    {
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe um RAP válido.'], 422);
        }
        try {
            $code = $quality->deleteReport($id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível excluir o RAP.'], 503);
        }

        return $code === null
            ? response()->json(['message' => 'RAP não encontrado.'], 404)
            : response()->json(['message' => "{$code} excluído com sucesso.", 'code' => $code]);
    }

    public function deleteDispatch(
        Request $request,
        QualityService $quality,
        UploadService $uploads
    ): JsonResponse {
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe um RETIR válido.'], 422);
        }
        try {
            $dispatch = $quality->deleteDispatch($id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível excluir o RETIR.'], 503);
        }
        if ($dispatch === null) {
            return response()->json(['message' => 'RETIR não encontrado.'], 404);
        }
        $uploads->remove($dispatch['photos']);

        return response()->json([
            'message' => "{$dispatch['code']} excluído com sucesso.",
            'code' => $dispatch['code'],
        ]);
    }

    public function deleteComplaint(Request $request, QualityService $quality): JsonResponse
    {
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe um RSC válido.'], 422);
        }
        try {
            $code = $quality->deleteComplaint($id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível excluir o RSC.'], 503);
        }

        return $code === null
            ? response()->json(['message' => 'RSC não encontrado.'], 404)
            : response()->json(['message' => "{$code} excluído com sucesso.", 'code' => $code]);
    }
}
