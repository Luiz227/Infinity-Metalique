<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\QualitySettingsService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class QualitySettingsController extends Controller
{
    public function show(QualitySettingsService $settings): JsonResponse
    {
        try {
            return response()->json($settings->read());
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar as configurações da Qualidade.'], 503);
        }
    }

    public function save(Request $request, QualitySettingsService $settings): JsonResponse
    {
        try {
            $result = $settings->save($request->all());
        } catch (QueryException) {
            return response()->json([
                'message' => 'As configurações não puderam ser salvas. Nada foi alterado.',
            ], 503);
        }

        if (! $result['success']) {
            return response()->json(['message' => $result['message']], 422);
        }

        return response()->json(['message' => $result['message']] + $settings->read());
    }
}
