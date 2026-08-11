<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('POST');
$user = requireApiUser();
$data = apiRequestData();
requireCsrfToken($data['csrfToken'] ?? null);

$name = normalizeName((string) ($data['name'] ?? ''));
$nickname = normalizeName((string) ($data['nickname'] ?? ''));

if (mb_strlen($name) < 3 || mb_strlen($name) > 120) {
    jsonResponse(['message' => 'Informe um nome válido de 3 a 120 caracteres.'], 422);
}

if (mb_strlen($nickname) > 50) {
    jsonResponse(['message' => 'O apelido deve ter no máximo 50 caracteres.'], 422);
}

try {
    $query = database()->prepare(
        'UPDATE users SET name = :name, nickname = :nickname WHERE id = :id'
    );
    $query->execute([
        'name' => $name,
        'nickname' => $nickname !== '' ? $nickname : null,
        'id' => (int) $user['id'],
    ]);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível atualizar os dados do perfil.'], 503);
}

jsonResponse(['message' => 'Perfil atualizado com sucesso.', 'user' => currentUser()]);
