<?php

declare(strict_types=1);

require_once __DIR__ . '/backend/auth.php';

if (!currentUser()) {
    redirect(frontendRoute('/login'));
}

redirect(frontendRoute('/sistema'));
