<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('POST');
$user = requireApiUser(true);
$data = apiRequestData();
requireCsrfToken($data['csrfToken'] ?? null);

$currentPassword = (string) ($data['currentPassword'] ?? '');
$newPassword = (string) ($data['newPassword'] ?? '');
$confirmation = (string) ($data['confirmation'] ?? '');

if ($policyError = passwordPolicyError($newPassword)) {
    jsonResponse(['message' => $policyError], 422);
}

if ($newPassword !== $confirmation) {
    jsonResponse(['message' => 'A confirmação da nova senha não confere.'], 422);
}

try {
    $query = database()->prepare('SELECT password_hash FROM users WHERE id = :id LIMIT 1');
    $query->execute(['id' => (int) $user['id']]);
    $hash = $query->fetchColumn();

    if (!is_string($hash) || !password_verify($currentPassword, $hash)) {
        jsonResponse(['message' => 'A senha atual está incorreta.'], 422);
    }

    if (password_verify($newPassword, $hash)) {
        jsonResponse(['message' => 'Escolha uma senha diferente da atual.'], 422);
    }

    database()->prepare(
        'UPDATE users SET password_hash = :hash, must_change_password = 0 WHERE id = :id'
    )
        ->execute([
            'hash' => password_hash($newPassword, PASSWORD_DEFAULT),
            'id' => (int) $user['id'],
        ]);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível alterar a senha.'], 503);
}

$updatedUser = currentUser();
jsonResponse(['message' => 'Senha alterada com sucesso.', 'user' => $updatedUser]);
