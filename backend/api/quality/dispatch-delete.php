<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';
require_once dirname(__DIR__, 2) . '/quality.php';
require_once dirname(__DIR__, 2) . '/uploads.php';

requireApiMethod('POST');
requireApiPermission('quality.manage');

$data = apiRequestData();
requireCsrfToken($data['csrfToken'] ?? null);

$id = (int) ($data['id'] ?? 0);

if ($id <= 0) {
    jsonResponse(['message' => 'Informe um RETIR válido.'], 422);
}

try {
    $dispatch = deleteMachineDispatch($id);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível excluir o RETIR.'], 503);
}

if ($dispatch === null) {
    jsonResponse(['message' => 'RETIR não encontrado.'], 404);
}

removeStoredImages($dispatch['photos']);

jsonResponse([
    'message' => "{$dispatch['code']} excluído com sucesso.",
    'code' => $dispatch['code'],
]);
