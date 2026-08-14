<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\UserPresence;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

final class AuthenticateApi
{
    public function handle(Request $request, Closure $next, string $mode = 'complete'): Response
    {
        $user = Auth::user();

        if ($user === null || ! $user->is_active) {
            Auth::logout();

            return new JsonResponse(['message' => 'Faça login para continuar.'], 401);
        }

        if ($mode !== 'allow-password-change' && $user->must_change_password) {
            return new JsonResponse(['message' => 'Altere sua senha temporária para continuar.'], 428);
        }

        UserPresence::keepAlive((int) $user->getKey());

        return $next($request);
    }
}
