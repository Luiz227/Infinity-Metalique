<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api.php';

requireApiMethod('POST');
$currentUser = currentUser();

if (!$currentUser) {
    jsonResponse(['message' => 'Faça login para alterar sua foto.'], 401);
}

$submittedToken = $_POST['csrfToken'] ?? null;

if (!is_string($submittedToken) || !validCsrfToken($submittedToken)) {
    jsonResponse(['message' => 'A sessão expirou. Atualize a página e tente novamente.'], 419);
}

$uploadedFile = $_FILES['profilePhoto'] ?? null;

if (!is_array($uploadedFile) || ($uploadedFile['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
    jsonResponse(['message' => 'Escolha uma imagem para continuar.'], 422);
}

if (($uploadedFile['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
    jsonResponse(['message' => 'Não foi possível receber a imagem. Tente novamente.'], 422);
}

if (($uploadedFile['size'] ?? 0) > 5 * 1024 * 1024) {
    jsonResponse(['message' => 'A imagem deve ter no máximo 5 MB.'], 422);
}

$temporaryPath = (string) ($uploadedFile['tmp_name'] ?? '');
$mimeType = (new finfo(FILEINFO_MIME_TYPE))->file($temporaryPath);
$allowedTypes = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

if (!isset($allowedTypes[$mimeType]) || @getimagesize($temporaryPath) === false) {
    jsonResponse(['message' => 'Envie uma imagem JPG, PNG ou WebP válida.'], 422);
}

$uploadDirectory = dirname(__DIR__, 2) . '/assets/uploads/profiles';

if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true)) {
    jsonResponse(['message' => 'Não foi possível preparar a pasta de imagens.'], 500);
}

$fileName = bin2hex(random_bytes(16)) . '.' . $allowedTypes[$mimeType];
$destination = $uploadDirectory . '/' . $fileName;
$publicPath = 'assets/uploads/profiles/' . $fileName;

if (!move_uploaded_file($temporaryPath, $destination)) {
    jsonResponse(['message' => 'Não foi possível salvar a imagem.'], 500);
}

try {
    $query = database()->prepare('UPDATE users SET profile_photo = :profile_photo WHERE id = :id');
    $query->execute(['profile_photo' => $publicPath, 'id' => (int) $currentUser['id']]);
} catch (PDOException) {
    @unlink($destination);
    jsonResponse(['message' => 'Não foi possível atualizar a foto no banco de dados.'], 503);
}

$oldPhoto = (string) ($currentUser['profile_photo'] ?? '');

if (str_starts_with($oldPhoto, 'assets/uploads/profiles/')) {
    $oldFile = $uploadDirectory . '/' . basename($oldPhoto);
    if (is_file($oldFile) && $oldFile !== $destination) {
        @unlink($oldFile);
    }
}

$_SESSION['user']['profile_photo'] = $publicPath;

jsonResponse(['message' => 'Foto de perfil atualizada com sucesso.', 'user' => currentUser()]);
