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

    /**
     * Recebe o recorte que as telas vão mostrar e, quando a foto é nova, também o
     * original de onde ele saiu.
     *
     * Reposicionar usa esta mesma rota: manda um recorte novo e o retângulo novo,
     * sem `profilePhotoSource`. Ausência de original significa "mantém o que já
     * está lá" - é o que permite reenquadrar sem reenviar a imagem inteira, e por
     * isso o original antigo só é apagado quando um novo o substitui.
     */
    public function photo(Request $request, UploadService $uploads): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $file = $request->file('profilePhoto');
        $sourceFile = $request->file('profilePhotoSource');

        if ($file === null) {
            return response()->json(['message' => 'Escolha uma imagem para continuar.'], 422);
        }

        try {
            $path = $uploads->storeImage($file, 'profiles');
            $sourcePath = $sourceFile !== null ? $uploads->storeImage($sourceFile, 'profiles') : null;
        } catch (RuntimeException $error) {
            // Se o segundo arquivo falhou, o primeiro já está no disco e ninguém
            // mais aponta para ele.
            $uploads->remove(array_filter([$path ?? null]));

            return response()->json(['message' => $error->getMessage()], 422);
        }

        $oldPhoto = $user->profile_photo ? (string) $user->profile_photo : null;
        $oldSource = $user->profile_photo_source ? (string) $user->profile_photo_source : null;

        $changes = ['profile_photo' => $path, 'profile_photo_crop' => self::crop($request->input('crop'))];
        if ($sourcePath !== null) {
            $changes['profile_photo_source'] = $sourcePath;
        }

        try {
            $user->forceFill($changes)->save();
        } catch (QueryException) {
            $uploads->remove(array_filter([$path, $sourcePath]));

            return response()->json(['message' => 'Não foi possível atualizar a foto no banco de dados.'], 503);
        }

        $uploads->remove(array_filter([
            $oldPhoto,
            $sourcePath !== null ? $oldSource : null,
        ]));

        return response()->json([
            'message' => 'Foto de perfil atualizada com sucesso.',
            'user' => $user->fresh()->toPublicArray(),
        ]);
    }

    /**
     * O retângulo do recorte, em pixels da imagem original. Um enquadramento
     * ilegível não vale uma requisição recusada: a foto em si está correta, e sem
     * o retângulo o recortador só reabre do zero.
     *
     * @return array{x: float, y: float, size: float}|null
     */
    private static function crop(mixed $value): ?array
    {
        $decoded = is_string($value) ? json_decode($value, true) : $value;
        if (! is_array($decoded)) {
            return null;
        }

        foreach (['x', 'y', 'size'] as $key) {
            if (! isset($decoded[$key]) || ! is_numeric($decoded[$key]) || ! is_finite((float) $decoded[$key])) {
                return null;
            }
        }

        $size = (float) $decoded['size'];
        if ($size <= 0) {
            return null;
        }

        return ['x' => (float) $decoded['x'], 'y' => (float) $decoded['y'], 'size' => $size];
    }
}
