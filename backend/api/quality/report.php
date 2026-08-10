<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';
require_once dirname(__DIR__, 2) . '/quality.php';

requireApiMethod('GET');
requireApiPermission('quality.view');

$id = (int) ($_GET['id'] ?? 0);

if ($id <= 0) {
    jsonResponse(['message' => 'Informe o apontamento desejado.'], 422);
}

try {
    $report = findInspectionReport($id);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível carregar o apontamento.'], 503);
}

if ($report === null) {
    jsonResponse(['message' => 'Apontamento não encontrado.'], 404);
}

jsonResponse(['report' => $report]);
