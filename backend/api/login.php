<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('POST');
$data = apiRequestData();
$submittedToken = $data['csrfToken'] ?? null;

if (!is_string($submittedToken) || !validCsrfToken($submittedToken)) {
    jsonResponse(['message' => 'A sessão expirou. Atualize a página e tente novamente.'], 419);
}

$email = (string) ($data['email'] ?? '');
$password = (string) ($data['password'] ?? '');

try {
    $authenticated = authenticateUser($email, $password);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível acessar o banco de dados.'], 503);
}

if (!$authenticated) {
    jsonResponse(['message' => 'E-mail ou senha inválidos.'], 401);
}

jsonResponse([
    'message' => 'Login realizado com sucesso.',
    'user' => currentUser(),
]);
