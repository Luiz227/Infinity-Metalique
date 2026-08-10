<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';
require_once dirname(__DIR__, 2) . '/quality.php';

requireApiMethod('GET');
requireApiPermission('quality.view');

$filters = qualityFilters($_GET);

try {
    $dashboard = qualityDashboard($filters);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível carregar os indicadores da qualidade.'], 503);
}

jsonResponse(['filters' => $filters] + $dashboard);
