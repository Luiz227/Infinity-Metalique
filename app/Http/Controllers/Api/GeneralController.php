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

            if ($user->hasPermission('quality.view') && $wants('quality')) {
                $reports = DB::select(
                    "SELECT CONCAT('report-', report.id) AS id,
                            CONCAT('Novo ', report.code) AS title,
                            CONCAT(creator.name, ' registrou este RAP.') AS description,
                            report.created_at
                       FROM inspection_reports report
                       JOIN users creator ON creator.id = report.created_by_user_id AND creator.is_active = 1
                      WHERE report.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                        AND report.created_by_user_id <> :current_user_id
                        AND (creator.role = 'admin' OR EXISTS (
                            SELECT 1 FROM user_permissions permission
                             WHERE permission.user_id = creator.id
                               AND permission.permission IN ('quality.view', 'quality.manage')
                        ))
                      ORDER BY report.created_at DESC LIMIT 6",
                    ['current_user_id' => $user->id]
                );
                foreach ($reports as $report) {
                    $items[] = [
                        'id' => (string) $report->id,
                        'title' => (string) $report->title,
                        'description' => (string) $report->description,
                        'createdAt' => CarbonImmutable::parse($report->created_at)->toAtomString(),
                        'route' => '/qualidade', 'tab' => 'registros', 'kind' => 'quality',
                    ];
                }
            }
        } catch (QueryException) {
            return response()->json(['message' => 'Não foi possível carregar as notificações.'], 503);
        }

        usort($items, static fn (array $left, array $right): int => strcmp($right['createdAt'], $left['createdAt']));

        return response()->json(['notifications' => array_slice($items, 0, 8)]);
    }
}
