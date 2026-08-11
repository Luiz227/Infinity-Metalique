<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api.php';
require_once dirname(__DIR__, 2) . '/quality.php';
require_once dirname(__DIR__, 2) . '/uploads.php';

requireApiMethod('POST');
$currentUser = requireApiPermission('quality.create_dispatch');

// O formulário envia multipart por causa das fotos, então os campos chegam em $_POST.
requireCsrfToken($_POST['csrfToken'] ?? null);

$validation = validateMachineDispatch($_POST);

if (!$validation['success']) {
    jsonResponse(['message' => $validation['message']], 422);
}

$uploads = normalizeUploadedFiles($_FILES['photos'] ?? null);

// A seção 5.2 do processo exige no mínimo duas imagens do carregamento.
if (count($uploads) < 2) {
    jsonResponse(['message' => 'Envie pelo menos duas fotos do carregamento.'], 422);
}

if (count($uploads) > 6) {
    jsonResponse(['message' => 'Envie no máximo seis fotos por coleta.'], 422);
}

$storedPaths = [];

foreach ($uploads as $upload) {
    $stored = storeUploadedImage($upload, 'dispatches');

    if (!$stored['success']) {
        // Nenhuma foto fica órfã no disco se uma delas falhar.
        removeStoredImages($storedPaths);
        jsonResponse(['message' => $stored['message']], 422);
    }

    $storedPaths[] = $stored['path'];
}

try {
    $dispatch = createMachineDispatch($validation['data'], $storedPaths, (int) $currentUser['id']);
} catch (PDOException) {
    removeStoredImages($storedPaths);
    jsonResponse(['message' => 'Não foi possível gravar a coleta.'], 503);
}

jsonResponse(['message' => 'Coleta registrada com sucesso.', 'dispatch' => $dispatch], 201);
