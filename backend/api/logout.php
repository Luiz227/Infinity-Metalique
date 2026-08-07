<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('POST');
$data = apiRequestData();
$submittedToken = $data['csrfToken'] ?? null;

if (!is_string($submittedToken) || !validCsrfToken($submittedToken)) {
    jsonResponse(['message' => 'A sessão expirou.'], 419);
}

logoutUser();
jsonResponse(['message' => 'Sessão encerrada.']);
