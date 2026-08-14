<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\UploadService;
use App\Support\Input;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class ProfileController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $name = Input::name($request->input('name'));
        $nickname = Input::name($request->input('nickname'));

        if (mb_strlen($name) < 3 || mb_strlen($name) > 120) {
            return response()->json(['message' => 'Informe um nome válido de 3 a 120 caracteres.'], 422);
        }
        if (mb_strlen($nickname) > 50) {
            return response()->json(['message' => 'O apelido deve ter no máximo 50 caracteres.'], 422);
        }

        try {
            $user->forceFill(['name' => $name, 'nickname' => $nickname !== '' ? $nickname : null])->save();
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível atualizar os dados do perfil.'], 503);
        }

        return response()->json([
            'message' => 'Perfil atualizado com sucesso.',
            'user' => $user->fresh()->toPublicArray(),
        ]);
    }

    public function photo(Request $request, UploadService $uploads): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $file = $request->file('profilePhoto');

        if ($file === null) {
            return response()->json(['message' => 'Escolha uma imagem para continuar.'], 422);
        }

        try {
            $path = $uploads->storeImage($file, 'profiles');
        } catch (RuntimeException $error) {
            return response()->json(['message' => $error->getMessage()], 422);
        }

        $oldPhoto = $user->profile_photo ? (string) $user->profile_photo : null;
        try {
            $user->forceFill(['profile_photo' => $path])->save();
        } catch (QueryException) {
            $uploads->remove([$path]);

            return response()->json(['message' => 'Não foi possível atualizar a foto no banco de dados.'], 503);
        }

        if ($oldPhoto !== null) {
            $uploads->remove([$oldPhoto]);
        }

        return response()->json([
            'message' => 'Foto de perfil atualizada com sucesso.',
            'user' => $user->fresh()->toPublicArray(),
        ]);
    }
}
