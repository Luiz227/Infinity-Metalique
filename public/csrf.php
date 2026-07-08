<?php

declare(strict_types=1);

// Inicia a sessão e gera o token, caso seja o primeiro acesso.
require_once dirname(__DIR__) . '/bootstrap.php';

// Este endpoint é apenas de leitura e aceita somente GET.
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    jsonResponse(['success' => false, 'message' => 'Método não permitido.'], 405);
}

// A tela deve buscar este endpoint antes de enviar login ou logout.
jsonResponse([
    'success' => true,
    'csrf_token' => $_SESSION['csrf_token'],
]);
