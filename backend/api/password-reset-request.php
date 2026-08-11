<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('POST');
$data = apiRequestData();
requireCsrfToken($data['csrfToken'] ?? null);

$email = normalizeEmail((string) ($data['email'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
    jsonResponse(['message' => 'Informe um e-mail válido.'], 422);
}

$genericMessage = 'Se o e-mail estiver cadastrado, a solicitação será enviada ao administrador.';

try {
    $connection = database();
    $query = $connection->prepare('SELECT id FROM users WHERE email = :email AND is_active = 1 LIMIT 1');
    $query->execute(['email' => $email]);
    $userId = (int) ($query->fetchColumn() ?: 0);

    if ($userId === 0) {
        jsonResponse(['message' => $genericMessage]);
    }

    $existing = $connection->prepare(
        "SELECT id
           FROM password_reset_requests
          WHERE user_id = :user_id
            AND status IN ('pending', 'approved')
            AND (status = 'pending' OR expires_at > NOW())
          ORDER BY id DESC
          LIMIT 1"
    );
    $existing->execute(['user_id' => $userId]);
    if ($existing->fetchColumn()) {
        jsonResponse([
            'message' => 'Já existe uma solicitação em análise para este usuário.',
            'alreadyPending' => true,
        ]);
    }

    $requestToken = bin2hex(random_bytes(32));
    $insert = $connection->prepare(
        'INSERT INTO password_reset_requests (user_id, request_token_hash)
         VALUES (:user_id, :request_token_hash)'
    );
    $insert->execute([
        'user_id' => $userId,
        'request_token_hash' => hash('sha256', $requestToken),
    ]);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível solicitar a recuperação de senha.'], 503);
}

jsonResponse([
    'message' => 'Solicitação enviada. Aguarde a aprovação do administrador.',
    'requestToken' => $requestToken,
]);
