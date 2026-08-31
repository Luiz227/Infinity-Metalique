<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\SectorPurgeService;
use App\Support\SectorData;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * A zona de perigo.
 *
 * O cargo é conferido aqui dentro, e não por `permission:`, porque uma chave em
 * `Permissions` é por construção uma coisa que se concede - e o pedido era o
 * contrário disso. É o mesmo caminho que `user-delete.php` já faz.
 */
final class SectorPurgeController extends Controller
{
    public function __construct(private readonly SectorPurgeService $purges) {}

    public function index(Request $request): JsonResponse
    {
        if ($denied = $this->denyNonAdmin($request)) {
            return $denied;
        }

        // A trilha entra no mesmo try: fora dele, uma falha nela viraria 500 em
        // vez da mensagem que a tela sabe mostrar.
        try {
            $this->purges->sweep();
            $sectors = array_map(fn (string $sector): array => [
                'id' => $sector,
                'label' => SectorData::label($sector),
                'confirmation' => mb_strtoupper(SectorData::label($sector)),
            ] + $this->purges->overview($sector), SectorData::keys());
            $lastPurge = $this->lastPurge();
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar as abas.'], 503);
        }

        return response()->json(['sectors' => $sectors, 'lastPurge' => $lastPurge]);
    }

    public function prepare(Request $request): JsonResponse
    {
        if ($denied = $this->denyNonAdmin($request)) {
            return $denied;
        }

        /** @var User $administrator */
        $administrator = $request->user();
        $sector = (string) $request->input('sector', '');
        $submitted = is_array($request->input('groups')) ? $request->input('groups') : [];
        $confirmation = trim((string) $request->input('confirmation', ''));
        $password = (string) $request->input('password', '');

        if (! SectorData::has($sector)) {
            return response()->json(['message' => 'Escolha um setor válido.'], 422);
        }

        try {
            $groups = $this->purges->normalizeGroups($sector, array_map(strval(...), $submitted));
        } catch (RuntimeException $error) {
            return response()->json(['message' => $error->getMessage()], 422);
        }

        $expected = mb_strtoupper(SectorData::label($sector));
        if (mb_strtoupper($confirmation) !== $expected) {
            return response()->json(['message' => 'Digite '.$expected.' para confirmar.'], 422);
        }

        /*
         * O `throttle` da rota conta requests, não senhas erradas: sozinho ele
         * trancaria um administrador legítimo que preparasse cinco vezes e
         * ainda daria cinco tentativas por minuto, para sempre, a quem chuta.
         * Este contador é por conta - a fábrica inteira sai de um IP só.
         */
        $limiterKey = 'sector-purge:'.$administrator->getKey();
        if (RateLimiter::tooManyAttempts($limiterKey, 5)) {
            return response()->json([
                'message' => 'Senha recusada várias vezes. Tente de novo em '
                    .max(1, (int) ceil(RateLimiter::availableIn($limiterKey) / 60)).' minuto(s).',
            ], 429);
        }
        if (! Hash::check($password, (string) $administrator->password_hash)) {
            RateLimiter::hit($limiterKey, 900);

            return response()->json(['message' => 'A senha está incorreta. Nada foi apagado.'], 422);
        }
        RateLimiter::clear($limiterKey);

        try {
            $prepared = $this->purges->prepare($sector, $groups, $administrator, $request->ip());
        } catch (RuntimeException $error) {
            return response()->json(['message' => $error->getMessage()], 503);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível preparar o backup.'], 503);
        }

        return response()->json($prepared);
    }

    /**
     * O token vai no corpo, não na query: ele autoriza baixar o setor inteiro e
     * apagá-lo, e numa URL acabaria no access.log do Apache e no histórico do
     * navegador.
     */
    public function download(Request $request): BinaryFileResponse|JsonResponse
    {
        if ($denied = $this->denyNonAdmin($request)) {
            return $denied;
        }

        /** @var User $administrator */
        $administrator = $request->user();
        $token = (string) $request->input('token', '');
        $record = $this->purges->usableToken($token, $administrator);

        if ($record === null) {
            return response()->json([
                'message' => 'Esta confirmação não vale mais. Comece de novo. Nada foi apagado.',
            ], 422);
        }

        $path = $this->purges->dumpPath($token);
        if (! is_file($path)) {
            return response()->json([
                'message' => 'O backup não foi encontrado. Comece de novo. Nada foi apagado.',
            ], 422);
        }

        @set_time_limit(0);
        $this->purges->markDownloaded($token);

        return response()->download($path, $this->purges->filename((string) $record->sector), [
            'Content-Type' => 'application/json',
        ]);
    }

    public function confirm(Request $request): JsonResponse
    {
        if ($denied = $this->denyNonAdmin($request)) {
            return $denied;
        }

        /** @var User $administrator */
        $administrator = $request->user();
        $token = (string) $request->input('token', '');
        $receivedBytes = max(0, $request->integer('receivedBytes'));

        try {
            $result = $this->purges->purge($token, $administrator, $receivedBytes);
        } catch (RuntimeException $error) {
            return response()->json(['message' => $error->getMessage()], 422);
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível apagar os dados do setor.'], 503);
        }

        $label = SectorData::label($result['sector']);
        $rows = array_sum($result['counts']);
        $expected = count($result['photos']);

        // O banco já está commitado: se as fotos travarem aqui, o expurgo
        // aconteceu de qualquer jeito, e a mensagem tem que dizer isso.
        $archived = 0;
        $photoError = null;
        try {
            $archived = $this->purges->archivePhotos($result['token'], $result['photos']);
        } catch (RuntimeException $error) {
            $photoError = $error->getMessage();
        }

        if ($photoError !== null || $archived < $expected) {
            Log::warning('Expurgo do setor arquivou menos fotos que o esperado.', [
                'sector' => $result['sector'],
                'expected' => $expected,
                'archived' => $archived,
                'error' => $photoError,
            ]);
        }

        $message = 'Dados da '.$label.' apagados: '.$rows.' '
            .($rows === 1 ? 'registro' : 'registros').' em '
            .implode(', ', $this->groupLabels($result['sector'], $result['groups'])).'.';
        if ($archived < $expected) {
            $message .= ' Atenção: '.($expected - $archived)
                .' foto(s) continuam na pasta pública e precisam ser removidas à mão.';
        }

        return response()->json([
            'message' => $message,
            'counts' => $this->labelledCounts($result['sector'], $result['counts']),
            'rows' => $rows,
            'photos' => $archived,
            'archive' => $this->purges->displayPath($result['token']),
        ]);
    }

    /** A última exclusão registrada, para a seção mostrar quem fez e quando. */
    private function lastPurge(): ?array
    {
        $record = DB::table('sector_purges')
            ->where('status', 'completed')
            ->orderByDesc('completed_at')
            ->first();

        if ($record === null) {
            return null;
        }

        $sector = (string) $record->sector;
        $groups = json_decode((string) $record->groups, true) ?: [];

        return [
            'sector' => SectorData::has($sector) ? SectorData::label($sector) : $sector,
            'groups' => $this->groupLabels($sector, $groups),
            'user' => (string) $record->user_name,
            'at' => (string) $record->completed_at,
        ];
    }

    /**
     * @param  array<string, int>  $counts
     * @return list<array{key: string, label: string, rows: int}>
     */
    private function labelledCounts(string $sector, array $counts): array
    {
        $labelled = [];
        foreach ($counts as $group => $rows) {
            $labelled[] = [
                'key' => $group,
                'label' => SectorData::hasGroup($sector, $group)
                    ? SectorData::group($sector, $group)['label']
                    : $group,
                'rows' => $rows,
            ];
        }

        return $labelled;
    }

    /**
     * @param  list<string>  $groups
     * @return list<string>
     */
    private function groupLabels(string $sector, array $groups): array
    {
        return array_values(array_map(
            static fn (string $group): string => SectorData::hasGroup($sector, $group)
                ? SectorData::group($sector, $group)['label']
                : $group,
            $groups
        ));
    }

    private function denyNonAdmin(Request $request): ?JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return $user->role === 'admin'
            ? null
            : response()->json(['message' => 'Somente administradores podem apagar os dados de um setor.'], 403);
    }
}
