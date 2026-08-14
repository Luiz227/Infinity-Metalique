<?php

use App\Http\Middleware\AuthenticateApi;
use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\VerifyApiCsrfToken;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Env;

/*
 * O Apache do XAMPP roda mod_php em build ZTS sob mpm_winnt: um unico processo
 * atende todas as requisicoes em threads paralelas. O adaptador padrao do Dotenv
 * grava o .env com putenv(), que escreve no ambiente global do processo e nao e
 * thread-safe. Sob chamadas simultaneas (o Dashboard e a Qualidade disparam quatro
 * de uma vez), uma thread lia APP_KEY como null enquanto outra reescrevia o bloco,
 * derrubando a requisicao com MissingAppKeyException.
 *
 * Sem o putenv as variaveis ficam apenas em $_ENV/$_SERVER, que sao por requisicao.
 */
Env::disablePutenv();

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->validateCsrfTokens(except: ['backend/api/*']);
        $middleware->alias([
            'api.auth' => AuthenticateApi::class,
            'api.csrf' => VerifyApiCsrfToken::class,
            'permission' => EnsurePermission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('backend/api/*') || $request->expectsJson(),
        );
    })->create();
