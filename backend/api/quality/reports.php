<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';
require_once dirname(__DIR__, 2) . '/quality.php';

requireApiMethod('GET');
requireApiPermission('quality.view');

$filters = qualityFilters($_GET);
$page = (int) ($_GET['page'] ?? 1);

try {
    $reports = listInspectionReports($filters, $page);
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível carregar os apontamentos.'], 503);
}

jsonResponse($reports);
