<?php

declare(strict_types=1);

// Carrega as funções básicas da API, incluindo a resposta em JSON.
require_once dirname(__DIR__) . '/bootstrap.php';

// A raiz serve apenas para confirmar que o backend está funcionando.
// Nenhuma tela HTML é criada aqui.
jsonResponse([
    'success' => true,
    'message' => 'Backend de autenticação funcionando.',
    'endpoints' => [
        'csrf' => 'GET /csrf.php',
        'login' => 'POST /login.php',
        'session' => 'GET /session.php',
        'logout' => 'POST /logout.php',
    ],
]);
