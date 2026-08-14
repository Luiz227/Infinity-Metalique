<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Router do servidor embutido do PHP (php -S)
|--------------------------------------------------------------------------
|
| Emula o mod_rewrite do Apache para o ambiente de desenvolvimento, que sobe
| com "php -S 127.0.0.1:8082 -t public server.php".
|
| Devolver false entrega somente recursos publicos estaticos pelo tratamento
| padrao do servidor. As APIs em /backend/api/ sempre passam pelo Laravel,
| preservando as URLs consumidas pelo frontend sem executar PHP fora dele.
|
| Diferente do server.php do proprio framework, o caminho publico vem de
| __DIR__ e nao de getcwd(), para nao depender de onde o processo foi iniciado.
|
*/

$publicPath = __DIR__.'/public';

$uri = urldecode(
    parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? ''
);

if (str_starts_with($uri, '/backend/api/')) {
    require_once $publicPath.'/index.php';

    return true;
}

if ($uri !== '/' && file_exists($publicPath.$uri)) {
    return false;
}

require_once $publicPath.'/index.php';
