<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use RuntimeException;

final class UploadService
{
    private const MAX_BYTES = 5 * 1024 * 1024;

    /** @var array<string, string> */
    private const TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    public function storeImage(UploadedFile $file, string $folder): string
    {
        if (! in_array($folder, ['profiles', 'dispatches'], true)) {
            throw new RuntimeException('Pasta de imagens inválida.');
        }
        if (! $file->isValid()) {
            throw new RuntimeException('Não foi possível receber a imagem. Tente novamente.');
        }
        if (($file->getSize() ?? 0) > self::MAX_BYTES) {
            throw new RuntimeException('Cada imagem deve ter no máximo 5 MB.');
        }

        $mime = $file->getMimeType();
        if (! is_string($mime) || ! isset(self::TYPES[$mime]) || @getimagesize($file->getPathname()) === false) {
            throw new RuntimeException('Envie imagens JPG, PNG ou WebP válidas.');
        }

        $directory = public_path('assets/uploads/'.$folder);
        if (! is_dir($directory) && ! mkdir($directory, 0755, true) && ! is_dir($directory)) {
            throw new RuntimeException('Não foi possível preparar a pasta de imagens.');
        }

        $name = Str::random(32).'.'.self::TYPES[$mime];
        $file->move($directory, $name);

        return 'assets/uploads/'.$folder.'/'.$name;
    }

    /** @param iterable<string> $paths */
    public function remove(iterable $paths): void
    {
        foreach ($paths as $path) {
            if (! str_starts_with($path, 'assets/uploads/')) {
                continue;
            }

            $fullPath = public_path('assets/uploads/'.basename(dirname($path)).'/'.basename($path));
            if (is_file($fullPath)) {
                @unlink($fullPath);
            }
        }
    }

    /**
     * Tira as imagens da pasta pública sem destruí-las.
     *
     * Um expurgo promete um backup, e um backup em JSON não carrega imagem
     * nenhuma. Mover é o que mantém a promessa honesta: o `rename` no mesmo
     * volume é instantâneo e não gasta disco a mais, a pasta pública fica limpa
     * - que é o que "apagar" significa para quem clicou - e os arquivos seguem
     * recuperáveis ao lado do dump.
     *
     * @param  iterable<string>  $paths
     * @return int Quantos arquivos realmente saíram da pasta pública.
     */
    public function archive(iterable $paths, string $destination): int
    {
        if (! is_dir($destination) && ! mkdir($destination, 0755, true) && ! is_dir($destination)) {
            throw new RuntimeException('Não foi possível preparar a pasta do arquivo morto.');
        }

        $moved = 0;
        foreach ($paths as $path) {
            if (! str_starts_with($path, 'assets/uploads/')) {
                continue;
            }

            $name = basename($path);
            $fullPath = public_path('assets/uploads/'.basename(dirname($path)).'/'.$name);
            if (! is_file($fullPath)) {
                continue;
            }

            if (@rename($fullPath, $destination.DIRECTORY_SEPARATOR.$name)) {
                $moved++;
                continue;
            }

            // Falhou mover - volume diferente, permissão. Guardar o arquivo não
            // pode custar deixá-lo servível pela web depois de um "apagar".
            @unlink($fullPath);
        }

        return $moved;
    }
}
