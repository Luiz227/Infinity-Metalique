<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';

// Rejeita IDs de sessão desconhecidos enviados pelo navegador.
ini_set('session.use_strict_mode', '1');

$isHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';

// HttpOnly protege o cookie do JavaScript e SameSite reduz ataques CSRF.
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

// Cabeçalhos simples de segurança aplicados antes de qualquer HTML.
if (!headers_sent()) {
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
}

// Cada sessão recebe um token secreto usado em todos os formulários POST.
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

function csrfToken(): string
{
    return (string) $_SESSION['csrf_token'];
}

function validCsrfToken(?string $token): bool
{
    // hash_equals evita comparação vulnerável a ataques de tempo.
    return is_string($token)
        && $token !== ''
        && hash_equals((string) ($_SESSION['csrf_token'] ?? ''), $token);
}

function flash(string $key, mixed $value): void
{
    // Mensagens flash sobrevivem a um redirecionamento e são lidas uma única vez.
    $_SESSION['flash'][$key] = $value;
}

function consumeFlash(string $key, mixed $default = null): mixed
{
    $value = $_SESSION['flash'][$key] ?? $default;
    unset($_SESSION['flash'][$key]);

    return $value;
}

function redirect(string $location): never
{
    header('Location: ' . $location);
    exit;
}

function escape(string $value): string
{
    // Converte caracteres especiais antes de inserir valores no HTML.
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
