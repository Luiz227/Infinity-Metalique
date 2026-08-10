<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';
require_once dirname(__DIR__, 2) . '/quality.php';

requireApiMethod('GET');
requireApiPermission('quality.view');

try {
    $options = qualityOptions();
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível carregar as listas do setor de qualidade.'], 503);
}

jsonResponse($options);
