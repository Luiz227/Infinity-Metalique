<?php

declare(strict_types=1);

// Recupera a sessão que será encerrada.
require_once dirname(__DIR__) . '/bootstrap.php';

// Logout aceita apenas POST.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    jsonResponse(['success' => false, 'message' => 'Método não permitido.'], 405);
}

// O token pode ser enviado pelo cabeçalho X-CSRF-Token ou no corpo da requisição.
$data = requestData();
if (!validCsrfToken($data)) {
    jsonResponse(['success' => false, 'message' => 'Token CSRF inválido.'], 403);
}

// Remove todos os valores armazenados na sessão.
$_SESSION = [];

// Apaga o cookie da sessão no navegador, quando ele estiver em uso.
if (ini_get('session.use_cookies')) {
    $parameters = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $parameters['path'], $parameters['domain'], $parameters['secure'], $parameters['httponly']);
}
// Apaga a sessão no servidor.
session_destroy();

// Confirma para o frontend que a autenticação foi encerrada.
jsonResponse(['success' => true, 'message' => 'Logout realizado com sucesso.']);
