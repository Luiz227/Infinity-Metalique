<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';
require_once dirname(__DIR__, 2) . '/quality.php';

requireApiMethod('GET');
requireApiUser();

$filters = qualityFilters($_GET);
$page = (int) ($_GET['page'] ?? 1);

try {
    $dispatches = listMachineDispatches($filters, $page);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível carregar as coletas.'], 503);
}

jsonResponse($dispatches);
