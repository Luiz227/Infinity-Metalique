<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ActionPlanService;
use App\Services\QualityService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ActionPlanController extends Controller
{
    public function index(Request $request, ActionPlanService $plans, QualityService $quality): JsonResponse
    {
        $filters = $quality->filters($request->query());

        try {
            return response()->json($plans->plans(
                $filters,
                $request->integer('page', 1),
                $request->integer('perPage', 25)
            ) + [
                'cards' => $plans->cards($filters),
                'entries' => $plans->latestEntries($filters),
            ]);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar os planos de ação.'], 503);
        }
    }

    public function show(Request $request, ActionPlanService $plans): JsonResponse
    {
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe o plano de ação desejado.'], 422);
        }
        try {
            $plan = $plans->find($id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar o plano de ação.'], 503);
        }

        return $plan === null
            ? response()->json(['message' => 'Plano de ação não encontrado.'], 404)
            : response()->json(['plan' => $plan]);
    }

    public function create(Request $request, ActionPlanService $plans): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validation = $plans->validatePlanRequest($request->all());
        if (! $validation['success']) {
            return response()->json(['message' => $validation['message']], 422);
        }
        try {
            $plan = $plans->create($validation['data'], $user);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível abrir o plano de ação.'], 503);
        }

        return response()->json(['message' => 'Plano de ação aberto com sucesso.', 'plan' => $plan], 201);
    }

    public function entry(Request $request, ActionPlanService $plans): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe o plano de ação desejado.'], 422);
        }
        $validation = $plans->validateEntry($request->all());
        if (! $validation['success']) {
            return response()->json(['message' => $validation['message']], 422);
        }
        try {
            $plan = $plans->addEntry($id, $validation['data'], (int) $user->id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível gravar o andamento.'], 503);
        }

        return $plan === null
            ? response()->json(['message' => 'Plano de ação não encontrado.'], 404)
            : response()->json(['message' => 'Andamento registrado.', 'plan' => $plan], 201);
    }

    /** Fecha o plano ou, com `reopen`, desfaz um fechamento errado. */
    public function close(Request $request, ActionPlanService $plans): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe o plano de ação desejado.'], 422);
        }

        try {
            if (filter_var($request->input('reopen', false), FILTER_VALIDATE_BOOLEAN)) {
                $result = $plans->reopen($id, $plans->note($request->input('note')), (int) $user->id);
            } else {
                $validation = $plans->validateClose($request->all());
                if (! $validation['success']) {
                    return response()->json(['message' => $validation['message']], 422);
                }
                $result = $plans->close($id, $validation['data'], (int) $user->id);
            }
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível atualizar o plano de ação.'], 503);
        }

        return $result['status'] === 200
            ? response()->json(['message' => $result['message'], 'plan' => $result['plan']])
            : response()->json(['message' => $result['message']], $result['status']);
    }

    public function delete(Request $request, ActionPlanService $plans): JsonResponse
    {
        $id = $request->integer('id');
        if ($id <= 0) {
            return response()->json(['message' => 'Informe um plano de ação válido.'], 422);
        }
        try {
            $code = $plans->delete($id);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível excluir o plano de ação.'], 503);
        }

        return $code === null
            ? response()->json(['message' => 'Plano de ação não encontrado.'], 404)
            : response()->json(['message' => "{$code} excluído com sucesso.", 'code' => $code]);
    }
}
