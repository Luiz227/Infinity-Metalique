<?php

declare(strict_types=1);

/**
 * Recebimento de imagens enviadas pelos formulários. A validação repete a que já
 * era feita em api/profile-photo.php: tipo real conferido pelo conteúdo do arquivo,
 * nome sorteado no servidor e destino protegido contra execução de script.
 */

const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_IMAGE_TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

/**
 * O PHP entrega vários arquivos de um mesmo campo como arrays paralelos.
 * Esta função devolve uma lista de arquivos no formato de envio único.
 */
function normalizeUploadedFiles(?array $field): array
{
    if ($field === null || !isset($field['name'])) {
        return [];
    }

    if (!is_array($field['name'])) {
        return ($field['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE ? [] : [$field];
    }

    $files = [];

    foreach (array_keys($field['name']) as $index) {
        if (($field['error'][$index] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            continue;
        }

        $files[] = [
            'name' => $field['name'][$index],
            'type' => $field['type'][$index] ?? '',
            'tmp_name' => $field['tmp_name'][$index] ?? '',
            'error' => $field['error'][$index] ?? UPLOAD_ERR_OK,
            'size' => $field['size'][$index] ?? 0,
        ];
    }

    return $files;
}

/**
 * Valida e move uma imagem para assets/uploads/<pasta>.
 * Devolve ['success' => bool, 'message' => string, 'path' => string].
 */
function storeUploadedImage(array $file, string $folder): array
{
    $fail = static fn (string $message): array => ['success' => false, 'message' => $message, 'path' => ''];

    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        return $fail('Não foi possível receber a imagem. Tente novamente.');
    }

    if (($file['size'] ?? 0) > UPLOAD_MAX_BYTES) {
        return $fail('Cada imagem deve ter no máximo 5 MB.');
    }

    $temporaryPath = (string) ($file['tmp_name'] ?? '');

    if (!is_uploaded_file($temporaryPath)) {
        return $fail('Envio inválido.');
    }

    // O tipo declarado pelo navegador não é confiável; vale o conteúdo do arquivo.
    $mimeType = (new finfo(FILEINFO_MIME_TYPE))->file($temporaryPath);

    if (!isset(UPLOAD_IMAGE_TYPES[$mimeType]) || @getimagesize($temporaryPath) === false) {
        return $fail('Envie imagens JPG, PNG ou WebP válidas.');
    }

    $directory = dirname(__DIR__) . '/assets/uploads/' . $folder;

    if (!is_dir($directory) && !mkdir($directory, 0755, true)) {
        return $fail('Não foi possível preparar a pasta de imagens.');
    }

    $fileName = bin2hex(random_bytes(16)) . '.' . UPLOAD_IMAGE_TYPES[$mimeType];

    if (!move_uploaded_file($temporaryPath, $directory . '/' . $fileName)) {
        return $fail('Não foi possível salvar a imagem.');
    }

    return [
        'success' => true,
        'message' => '',
        'path' => 'assets/uploads/' . $folder . '/' . $fileName,
    ];
}

/** Remove arquivos já gravados quando o restante do envio falha. */
function removeStoredImages(array $paths): void
{
    foreach ($paths as $path) {
        if (str_starts_with((string) $path, 'assets/uploads/')) {
            $file = dirname(__DIR__) . '/' . $path;

            if (is_file($file)) {
                @unlink($file);
            }
        }
    }
}
