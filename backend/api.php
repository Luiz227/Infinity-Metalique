<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

function jsonResponse(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function apiRequestData(): array
{
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));

    if (str_contains($contentType, 'application/json')) {
        $payload = json_decode((string) file_get_contents('php://input'), true);
        return is_array($payload) ? $payload : [];
    }

    return $_POST;
}

function requireApiMethod(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
        jsonResponse(['message' => 'Método não permitido.'], 405);
    }
}

/** Interrompe a requisição quando não há sessão ativa e devolve o usuário autenticado. */
function requireApiUser(): array
{
    $user = currentUser();

    if (!$user) {
        jsonResponse(['message' => 'Faça login para continuar.'], 401);
    }

    return $user;
}

/** Interrompe a requisição quando o token CSRF do formulário não confere. */
function requireCsrfToken(mixed $token): void
{
    if (!is_string($token) || !validCsrfToken($token)) {
        jsonResponse(['message' => 'A sessão expirou. Atualize a página e tente novamente.'], 419);
    }
}
