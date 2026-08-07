<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('GET');

try {
    $summary = userSummary();
} catch (PDOException) {
    jsonResponse(['message' => 'Não foi possível carregar os usuários.'], 503);
}

jsonResponse($summary);
