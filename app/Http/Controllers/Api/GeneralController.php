<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\UserPreferences;
use App\Support\UserPresence;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class GeneralController extends Controller
{
    public function supervisors(): JsonResponse
    {
        try {
            $supervisors = User::query()
                ->where('is_active', true)
                ->where('job_title', 'like', 'Supervisor%')
                ->orderBy('sector')
                ->orderBy('name')
                ->get(['id', 'name', 'sector', 'job_title'])
                ->map(static fn (User $user): array => [
                    'id' => (int) $user->id,
                    'name' => (string) $user->name,
                    'sector' => (string) $user->sector,
                    'jobTitle' => (string) $user->job_title,
                    'presence' => UserPresence::status((int) $user->getKey()),
                ])->all();
        } catch (QueryException) {
            return response()->json(['message' => 'NÃ£o foi possÃ­vel carregar os supervisores dos setores.'], 503);
        }

        return response()->json(['supervisors' => $supervisors]);
    }

    public function summary(): JsonResponse
    {
        try {
            $total = User::query()->where('is_active', true)->count();
            $users = User::query()
                ->where('is_active', true)
                ->inRandomOrder()
                ->limit(3)
                ->get(['id', 'name', 'profile_photo'])
                ->map(static fn (User $user): array => [
                    'id' => (int) $user->id,
                    'name' => (string) $user->name,
                    'profile_photo' => $user->profile_photo ? (string) $user->profile_photo : null,
                ])->all();
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar os usuários.'], 503);
        }

        return response()->json(['total' => $total, 'users' => $users]);
    }

    public function search(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $term = trim((string) $request->query('q', ''));
        if (mb_strlen($term) < 2) {
            return response()->json(['results' => []]);
        }

        $results = [];
        try {
            if ($user->hasPermission('quality.view')) {
                $reports = DB::table('inspection_reports as r')
                    ->leftJoin('clients as c', 'c.id', '=', 'r.client_id')
                    ->where(function ($query) use ($term): void {
                        $query->where('r.code', 'like', "%{$term}%")
                            ->orWhere('r.description', 'like', "%{$term}%")
                            ->orWhere('c.name', 'like', "%{$term}%");
                    })
                    ->orderByDesc('r.report_date')->orderByDesc('r.sequence')->limit(6)
                    ->get(['r.id', 'r.code', 'r.description', 'c.name as client']);
                foreach ($reports as $row) {
                    $results[] = [
                        'id' => 'report-'.$row->id,
                        'title' => (string) $row->code,
                        'subtitle' => trim((string) ($row->client ?: $row->description)),
                        'route' => '/qualidade', 'tab' => 'registros', 'type' => 'RAP',
                    ];
                }

                $dispatches = DB::table('machine_dispatches as d')
                    ->leftJoin('clients as c', 'c.id', '=', 'd.client_id')
                    ->where(function ($query) use ($term): void {
                        $query->where('d.code', 'like', "%{$term}%")
                            ->orWhere('d.model', 'like', "%{$term}%")
                            ->orWhere('c.name', 'like', "%{$term}%");
                    })
                    ->orderByDesc('d.dispatch_date')->orderByDesc('d.sequence')->limit(6)
                    ->get(['d.id', 'd.code', 'd.model', 'c.name as client']);
                foreach ($dispatches as $row) {
                    $results[] = [
                        'id' => 'dispatch-'.$row->id,
                        'title' => (string) $row->code,
                        'subtitle' => trim((string) ($row->client ?: $row->model)),
                        'route' => '/qualidade', 'tab' => 'coletas', 'type' => 'Produto coletado',
                    ];
                }
            }

            if ($user->hasPermission('users.manage')) {
                $users = User::query()
                    ->where(function ($query) use ($term): void {
                        $query->where('name', 'like', "%{$term}%")
                            ->orWhere('email', 'like', "%{$term}%")
                            ->orWhere('job_title', 'like', "%{$term}%");
                    })
                    ->orderBy('name')->limit(6)->get(['id', 'name', 'email', 'job_title']);
                foreach ($users as $found) {
                    $results[] = [
                        'id' => 'user-'.$found->id,
                        'title' => (string) $found->name,
                        'subtitle' => (string) $found->email,
                        'route' => '/usuarios', 'tab' => null, 'type' => (string) $found->job_title,
                    ];
                }
            }
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível realizar a pesquisa.'], 503);
        }

        return response()->json(['results' => array_slice($results, 0, 12)]);
    }

    public function notifications(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $items = [];

        // O silêncio é aplicado aqui, e não no navegador: o contador do sino
        // conta o que veio, então filtrar do lado de lá deixaria a bolinha
        // anunciando notificações que a pessoa mandou calar.
        $muted = UserPreferences::forUser((int) $user->getKey())['mutedNotifications'];
        $wants = static fn (string $kind): bool => ! in_array($kind, $muted, true);

        try {
            if ($user->role === 'admin' && $wants('password-reset')) {
                $resets = DB::table('password_reset_requests as request')
                    ->join('users as account', 'account.id', '=', 'request.user_id')
                    ->where('request.status', 'pending')->orderByDesc('request.created_at')->limit(6)
                    ->get(['request.id', 'account.name', 'account.email', 'request.created_at']);
                foreach ($resets as $reset) {
                    $items[] = [
                        'id' => 'password-reset-'.$reset->id,
                        'title' => $reset->name.' esqueceu a senha',
                        'description' => $reset->email.' solicitou autorização para cadastrar uma nova senha.',
                        'createdAt' => CarbonImmutable::parse($reset->created_at)->toAtomString(),
                        'route' => '/usuarios', 'tab' => null, 'kind' => 'password-reset',
                        'requestId' => (int) $reset->id,
                    ];
                }
            }

            if ($user->role === 'admin' && $wants('access-request')) {
                $accessRequests = DB::table('access_requests')->where('status', 'pending')
                    ->orderByDesc('created_at')->limit(6)->get();
                foreach ($accessRequests as $access) {
                    $admission = $access->admission_date
                        ? CarbonImmutable::parse($access->admission_date)->format('d/m/Y') : 'não informada';
                    $items[] = [
                        'id' => 'access-request-'.$access->id,
                        'title' => 'Solicitação de '.$access->name,
                        'description' => sprintf(
                            '%s · %s · Admissão: %s',
                            $access->sector ?: 'Setor não informado',
                            $access->job_title ?: 'Cargo não informado',
                            $admission
                        ),
                        'createdAt' => CarbonImmutable::parse($access->created_at)->toAtomString(),
                        'route' => '/usuarios', 'tab' => null, 'kind' => 'access-request',
                    ];
                }
            }

            if ($this->receivesQualityNotifications($user) && $wants('quality')) {
                $since = CarbonImmutable::now()->subDays(14);

                $reports = DB::table('inspection_reports as report')
                    ->join('users as creator', function ($join): void {
                        $join->on('creator.id', '=', 'report.created_by_user_id')
                            ->where('creator.is_active', true);
                    })
                    ->where('report.created_at', '>=', $since)
                    ->where('report.created_by_user_id', '<>', $user->id)
                    ->orderByDesc('report.created_at')
                    ->limit(6)
                    ->get(['report.id', 'report.code', 'report.created_at', 'creator.name as creator_name']);
                foreach ($reports as $report) {
                    $items[] = [
                        'id' => 'report-'.$report->id,
                        'title' => 'Novo '.$report->code,
                        'description' => $report->creator_name.' registrou este RAP.',
                        'createdAt' => CarbonImmutable::parse($report->created_at)->toAtomString(),
                        'route' => '/qualidade', 'tab' => 'registros', 'kind' => 'quality',
                    ];
                }

                $dispatches = DB::table('machine_dispatches as dispatch')
                    ->join('users as creator', function ($join): void {
                        $join->on('creator.id', '=', 'dispatch.created_by_user_id')
                            ->where('creator.is_active', true);
                    })
                    ->where('dispatch.created_at', '>=', $since)
                    ->where('dispatch.created_by_user_id', '<>', $user->id)
                    ->orderByDesc('dispatch.created_at')
                    ->limit(6)
                    ->get(['dispatch.id', 'dispatch.code', 'dispatch.created_at', 'creator.name as creator_name']);
                foreach ($dispatches as $dispatch) {
                    $items[] = [
                        'id' => 'dispatch-'.$dispatch->id,
                        'title' => 'Nova coleta '.$dispatch->code,
                        'description' => $dispatch->creator_name.' registrou esta coleta.',
                        'createdAt' => CarbonImmutable::parse($dispatch->created_at)->toAtomString(),
                        'route' => '/qualidade', 'tab' => 'coletas', 'kind' => 'quality',
                    ];
                }
            }
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar as notificações.'], 503);
        }

        usort($items, static fn (array $left, array $right): int => strcmp($right['createdAt'], $left['createdAt']));

        return response()->json(['notifications' => array_slice($items, 0, 8)]);
    }

    private function receivesQualityNotifications(User $user): bool
    {
        if (! $user->hasPermission('quality.view')) {
            return false;
        }

        $sector = Str::upper(Str::ascii(trim((string) $user->sector)));
        $sector = trim((string) preg_replace('/[^A-Z0-9]+/', ' ', $sector));

        return $sector === 'QUALIDADE' || str_contains($sector, 'QUALIDADE');
    }
}
