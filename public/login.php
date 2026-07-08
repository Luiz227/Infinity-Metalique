<?php

declare(strict_types=1);

// Disponibiliza a conexão, sessão e funções auxiliares.
require_once dirname(__DIR__) . '/bootstrap.php';

// Este endpoint aceita apenas requisições POST.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    jsonResponse(['success' => false, 'message' => 'Método não permitido.'], 405);
}

// Aceita dados enviados como JSON ou como formulário tradicional.
$data = requestData();

// Rejeita requisições criadas fora da sessão legítima do usuário.
if (!validCsrfToken($data)) {
    jsonResponse(['success' => false, 'message' => 'Token CSRF inválido.'], 403);
}

// Normaliza e valida os valores recebidos pelo formulário.
$rawEmail = trim((string) ($data['email'] ?? ''));
$password = (string) ($data['password'] ?? '');
$email = filter_var($rawEmail, FILTER_VALIDATE_EMAIL);

// Limita também o tamanho para evitar entradas exageradas ou maliciosas.
if ($email === false || strlen($rawEmail) > 254 || $password === '' || strlen($password) > 1024) {
    jsonResponse(['success' => false, 'message' => 'Informe um e-mail e uma senha válidos.'], 422);
}

// Após cinco erros, a sessão fica bloqueada por cinco minutos.
// É uma proteção simples contra tentativas automáticas de adivinhar a senha.
$attempts = (int) ($_SESSION['login_attempts'] ?? 0);
$blockedUntil = (int) ($_SESSION['login_blocked_until'] ?? 0);

if ($blockedUntil > time()) {
    jsonResponse([
        'success' => false,
        'message' => 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    ], 429);
}

// Libera a contagem quando o período de bloqueio já terminou.
if ($blockedUntil !== 0 && $blockedUntil <= time()) {
    $_SESSION['login_attempts'] = 0;
    $_SESSION['login_blocked_until'] = 0;
    $attempts = 0;
}

// Prepared statement evita injeção de SQL pelo campo de e-mail.
$statement = db()->prepare('SELECT id, name, email, password_hash FROM users WHERE email = :email LIMIT 1');
$statement->execute(['email' => strtolower($email)]);
$user = $statement->fetch();

// Compara a senha digitada com o hash; a mensagem não revela qual campo errou.
if (!$user || !password_verify($password, $user['password_hash'])) {
    $attempts++;
    $_SESSION['login_attempts'] = $attempts;

    if ($attempts >= 5) {
        $_SESSION['login_blocked_until'] = time() + 300;
    }

    // Pequeno atraso dificulta tentativas automatizadas de adivinhar senhas.
    usleep(250000);
    jsonResponse(['success' => false, 'message' => 'E-mail ou senha incorretos.'], 401);
}

// Atualiza hashes antigos automaticamente quando o algoritmo padrão evoluir.
if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
    $update = db()->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
    $update->execute(['hash' => password_hash($password, PASSWORD_DEFAULT), 'id' => $user['id']]);
}

// Troca o ID da sessão após o login para impedir session fixation.
session_regenerate_id(true);

// Um login válido limpa as tentativas anteriores.
unset($_SESSION['login_attempts'], $_SESSION['login_blocked_until']);

// Salva somente os dados necessários do usuário na sessão.
$_SESSION['user'] = [
    'id' => (int) $user['id'],
    'name' => $user['name'],
    'email' => $user['email'],
];
// Renova também o token CSRF depois da autenticação.
$_SESSION['csrf_token'] = bin2hex(random_bytes(32));

// Retorna os dados que a tela poderá usar após o login.
jsonResponse([
    'success' => true,
    'message' => 'Login realizado com sucesso.',
    'user' => $_SESSION['user'],
]);
