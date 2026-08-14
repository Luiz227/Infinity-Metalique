<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class VerifyApiCsrfToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $submitted = $request->input('csrfToken');
        $expected = $request->session()->token();

        if (! is_string($submitted) || ! is_string($expected) || ! hash_equals($expected, $submitted)) {
            return new JsonResponse(['message' => 'A sessão expirou. Atualize a página e tente novamente.'], 419);
        }

        return $next($request);
    }
}
