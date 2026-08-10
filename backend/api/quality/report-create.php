<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';
require_once dirname(__DIR__, 2) . '/quality.php';

requireApiMethod('POST');
$currentUser = requireApiPermission('quality.manage');

$data = apiRequestData();
requireCsrfToken($data['csrfToken'] ?? null);

$validation = validateInspectionReport($data);

if (!$validation['success']) {
    jsonResponse(['message' => $validation['message']], 422);
}

try {
    $report = createInspectionReport($validation['data'], (int) $currentUser['id']);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível gravar o apontamento.'], 503);
}

jsonResponse(['message' => 'Apontamento registrado com sucesso.', 'report' => $report], 201);
