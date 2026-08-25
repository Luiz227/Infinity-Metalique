<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\UserPreferences;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Só grava. A leitura sai junto da sessão (`User::toPublicArray`), para o tema
 * chegar no mesmo pacote do usuário - uma requisição a menos e nenhuma janela
 * em que a tela já pintou clara e escurece depois.
 */
final class PreferencesController extends Controller
{
    public function save(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        try {
            // Quem valida é o catálogo: chave desconhecida cai fora e valor
            // fora da lista volta ao padrão, então não há 422 a devolver aqui.
            $preferences = UserPreferences::store((int) $user->getKey(), $request->input('preferences'));
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível salvar as preferências.'], 503);
        }

        return response()->json([
            'message' => 'Preferências salvas.',
            'preferences' => $preferences,
        ]);
    }
}
