<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';
require_once dirname(__DIR__, 2) . '/quality.php';

requireApiMethod('GET');
requireApiPermission('quality.view');

$id = (int) ($_GET['id'] ?? 0);

if ($id <= 0) {
    jsonResponse(['message' => 'Informe a coleta desejada.'], 422);
}

try {
    $dispatch = findMachineDispatch($id);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível carregar a coleta.'], 503);
}

if ($dispatch === null) {
    jsonResponse(['message' => 'Coleta não encontrada.'], 404);
}

jsonResponse(['dispatch' => $dispatch]);
