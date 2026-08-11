<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';
require_once dirname(__DIR__, 2) . '/uploads.php';

requireApiMethod('POST');
$administrator = requireApiUser();
if (($administrator['role'] ?? '') !== 'admin') {
    jsonResponse(['message' => 'Somente administradores podem excluir contas.'], 403);
}

$data = apiRequestData();
requireCsrfToken($data['csrfToken'] ?? null);
$id = max(0, (int) ($data['id'] ?? 0));
if ($id === 0) {
    jsonResponse(['message' => 'Usuário inválido.'], 422);
}

try {
    $connection = database();
    $connection->beginTransaction();
    $query = $connection->prepare(
        'SELECT id, name, profile_photo, is_primary_admin FROM users WHERE id = :id FOR UPDATE'
    );
    $query->execute(['id' => $id]);
    $target = $query->fetch();

    if (!$target) {
        $connection->rollBack();
        jsonResponse(['message' => 'Usuário não encontrado.'], 404);
    }
    if (!empty($target['is_primary_admin'])) {
        $connection->rollBack();
        jsonResponse(['message' => 'A conta administradora principal não pode ser excluída.'], 422);
    }
    if ($id === (int) $administrator['id']) {
        $connection->rollBack();
        jsonResponse(['message' => 'Você não pode excluir a própria conta.'], 422);
    }

    $connection->prepare('DELETE FROM users WHERE id = :id')->execute(['id' => $id]);
    $connection->commit();

    if (!empty($target['profile_photo'])) {
        removeStoredImages([(string) $target['profile_photo']]);
    }
} catch (PDOException) {
    if (isset($connection) && $connection->inTransaction()) $connection->rollBack();
    jsonResponse(['message' => 'Não foi possível excluir a conta.'], 503);
}

jsonResponse(['message' => 'Conta de ' . (string) $target['name'] . ' excluída com sucesso.']);
