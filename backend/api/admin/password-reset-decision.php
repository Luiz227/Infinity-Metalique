<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';

requireApiMethod('POST');
$administrator = requireApiUser();
if (($administrator['role'] ?? '') !== 'admin') {
    jsonResponse(['message' => 'Somente administradores podem analisar esta solicitação.'], 403);
}

$data = apiRequestData();
requireCsrfToken($data['csrfToken'] ?? null);
$id = max(0, (int) ($data['id'] ?? 0));
$decision = (string) ($data['decision'] ?? '');
if ($id === 0 || !in_array($decision, ['approve', 'reject'], true)) {
    jsonResponse(['message' => 'Decisão inválida.'], 422);
}

try {
    $connection = database();
    $connection->beginTransaction();
    $query = $connection->prepare(
        "SELECT id FROM password_reset_requests WHERE id = :id AND status = 'pending' FOR UPDATE"
    );
    $query->execute(['id' => $id]);
    if (!$query->fetchColumn()) {
        $connection->rollBack();
        jsonResponse(['message' => 'Esta solicitação já foi analisada.'], 409);
    }

    if ($decision === 'approve') {
        $sql = "UPDATE password_reset_requests
                   SET status = 'approved', reviewed_by_user_id = :reviewed_by,
                       reviewed_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR)
                 WHERE id = :id";
        $message = 'Recuperação de senha aprovada.';
    } else {
        $sql = "UPDATE password_reset_requests
                   SET status = 'rejected', reviewed_by_user_id = :reviewed_by,
                       reviewed_at = NOW(), expires_at = NULL
                 WHERE id = :id";
        $message = 'Recuperação de senha recusada.';
    }
    $connection->prepare($sql)->execute([
        'reviewed_by' => (int) $administrator['id'],
        'id' => $id,
    ]);
    $connection->commit();
} catch (PDOException) {
    if (isset($connection) && $connection->inTransaction()) $connection->rollBack();
    jsonResponse(['message' => 'Não foi possível analisar a solicitação.'], 503);
}

jsonResponse(['message' => $message]);
