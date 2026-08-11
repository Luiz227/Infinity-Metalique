<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('GET');

$user = currentUser();

if (!$user) {
    jsonResponse(['user' => null], 401);
}

jsonResponse(['user' => $user]);
