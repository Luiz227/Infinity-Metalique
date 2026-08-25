<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ContactDirectoryService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ContactController extends Controller
{
    /** Rota pública: a Home mostra os ramais mesmo para quem não tem sessão. */
    public function index(ContactDirectoryService $directory): JsonResponse
    {
        try {
            return response()->json($directory->publicDirectory());
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar os ramais.'], 503);
        }
    }

    public function admin(ContactDirectoryService $directory): JsonResponse
    {
        try {
            return response()->json($directory->admin());
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar os ramais.'], 503);
        }
    }

    public function save(Request $request, ContactDirectoryService $directory): JsonResponse
    {
        try {
            $result = $directory->save($request->all());
        } catch (QueryException) {
            return response()->json([
                'message' => 'Os ramais não puderam ser salvos. Nada foi alterado.',
            ], 503);
        }

        if (! $result['success']) {
            return response()->json(['message' => $result['message']], 422);
        }

        return response()->json(['message' => $result['message']] + $directory->admin());
    }
}
