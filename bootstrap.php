<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';

// Permite que o frontend autorizado consuma a API mantendo o cookie da sessão.
// Em produção, FRONTEND_ORIGIN deve conter exatamente o domínio da tela.
$frontendOrigin = getenv('FRONTEND_ORIGIN') ?: '';
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($frontendOrigin !== '' && hash_equals($frontendOrigin, $requestOrigin)) {
    header('Access-Control-Allow-Origin: ' . $frontendOrigin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Vary: Origin');
}

// O navegador envia OPTIONS antes de alguns POSTs entre origens diferentes.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Evita que o PHP aceite um ID de sessão inventado pelo navegador.
ini_set('session.use_strict_mode', '1');

// Detecta HTTPS para ativar a flag "secure" do cookie em produção.
$isHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';

// Configura o cookie da sessão antes de iniciar a sessão.
// HttpOnly bloqueia acesso por JavaScript e SameSite reduz ataques CSRF.
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);

// Inicia ou recupera a sessão do visitante.
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

// Respostas de autenticação não devem ficar armazenadas no cache do navegador.
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

// Gera um token aleatório que acompanha formulários enviados pelo usuário.
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

/** Envia uma resposta JSON e encerra a requisição. */
function jsonResponse(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Lê JSON enviado no corpo da requisição; formulários POST continuam aceitos. */
function requestData(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (str_contains(strtolower($contentType), 'application/json')) {
        $data = json_decode((string) file_get_contents('php://input'), true);
        return is_array($data) ? $data : [];
    }

    return $_POST;
}

/** Confere com segurança o token CSRF enviado no corpo ou no cabeçalho. */
function validCsrfToken(array $data): bool
{
    $token = $data['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

    return is_string($token)
        && hash_equals($_SESSION['csrf_token'] ?? '', $token);
}
