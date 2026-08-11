<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';
require_once dirname(__DIR__, 2) . '/quality.php';

requireApiMethod('POST');
requireApiPermission('quality.manage');

$data = apiRequestData();
requireCsrfToken($data['csrfToken'] ?? null);

$id = (int) ($data['id'] ?? 0);

if ($id <= 0) {
    jsonResponse(['message' => 'Informe um RAP válido.'], 422);
}

try {
    $code = deleteInspectionReport($id);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível excluir o RAP.'], 503);
}

if ($code === null) {
    jsonResponse(['message' => 'RAP não encontrado.'], 404);
}

jsonResponse(['message' => "{$code} excluído com sucesso.", 'code' => $code]);
