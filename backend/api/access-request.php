<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('POST');
$data = apiRequestData();
$submittedToken = $data['csrfToken'] ?? null;

if (!is_string($submittedToken) || !validCsrfToken($submittedToken)) {
    jsonResponse(['message' => 'A sessão expirou. Atualize a página e tente novamente.'], 419);
}

try {
    $result = requestAccess(
        (string) ($data['name'] ?? ''),
        (string) ($data['email'] ?? ''),
        (string) ($data['password'] ?? '')
    );
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível acessar o banco de dados. Verifique o MySQL do XAMPP.'], 503);
}

if (!$result['success']) {
    jsonResponse(['message' => $result['message']], 422);
}

jsonResponse(['message' => $result['message']], 201);
