<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('POST');
$data = apiRequestData();
requireCsrfToken($data['csrfToken'] ?? null);

$email = normalizeEmail((string) ($data['email'] ?? ''));
$requestToken = (string) ($data['requestToken'] ?? '');
$newPassword = (string) ($data['newPassword'] ?? '');
$confirmation = (string) ($data['confirmation'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^[a-f0-9]{64}$/', $requestToken)) {
    jsonResponse(['message' => 'Solicitação de recuperação inválida.'], 422);
}
if ($policyError = passwordPolicyError($newPassword)) {
    jsonResponse(['message' => $policyError], 422);
}
if ($newPassword !== $confirmation) {
    jsonResponse(['message' => 'A confirmação da nova senha não confere.'], 422);
}

try {
    $connection = database();
    $connection->beginTransaction();
    $query = $connection->prepare(
        "SELECT request.id, request.user_id
           FROM password_reset_requests request
           JOIN users user ON user.id = request.user_id AND user.is_active = 1
          WHERE user.email = :email
            AND request.request_token_hash = :request_token_hash
            AND request.status = 'approved'
            AND request.expires_at > NOW()
          ORDER BY request.id DESC
          LIMIT 1
          FOR UPDATE"
    );
    $query->execute([
        'email' => $email,
        'request_token_hash' => hash('sha256', $requestToken),
    ]);
    $request = $query->fetch();
    if (!$request) {
        $connection->rollBack();
        jsonResponse(['message' => 'A aprovação expirou ou não é mais válida.'], 422);
    }

    $connection->prepare(
        'UPDATE users SET password_hash = :password_hash, must_change_password = 0 WHERE id = :id'
    )->execute([
        'password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
        'id' => (int) $request['user_id'],
    ]);
    $connection->prepare(
        "UPDATE password_reset_requests SET status = 'completed' WHERE id = :id"
    )->execute(['id' => (int) $request['id']]);
    $connection->commit();
} catch (PDOException) {
    if (isset($connection) && $connection->inTransaction()) $connection->rollBack();
    jsonResponse(['message' => 'Não foi possível cadastrar a nova senha.'], 503);
}

jsonResponse(['message' => 'Senha alterada com sucesso. Você já pode entrar no sistema.']);
