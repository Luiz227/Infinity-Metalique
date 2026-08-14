<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\QualityService;
use App\Services\UploadService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class QualityController extends Controller
{
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
}
