<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Rotas de navegacao
|--------------------------------------------------------------------------
|
| A interface fica no servidor Next.js. Estas rotas mantem os enderecos
| conhecidos do backend e encaminham o navegador para a pagina equivalente.
|
*/

$frontend = static fn (string $path = '/'): string => rtrim((string) config('app.frontend_url'), '/')
    .'/'
    .ltrim($path, '/');

Route::get('/', static fn () => redirect()->away($frontend('/')));

Route::get('/login', static fn () => redirect()->away($frontend('/login')));

Route::get('/cadastro', static fn () => redirect()->away($frontend('/solicitar-acesso')));

Route::get('/sistema', static function () use ($frontend) {
    return redirect()->away(auth()->check() ? $frontend('/sistema') : $frontend('/login'));
});
