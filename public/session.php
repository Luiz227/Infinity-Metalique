<?php

declare(strict_types=1);

// Recupera a sessão atual para informar se existe usuário autenticado.
require_once dirname(__DIR__) . '/bootstrap.php';

// A consulta da sessão é somente leitura e aceita apenas GET.
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    jsonResponse(['success' => false, 'message' => 'Método não permitido.'], 405);
}

// Se não houver login, o usuário será null.
$user = $_SESSION['user'] ?? null;

jsonResponse([
    'authenticated' => $user !== null,
    'user' => $user,
]);
