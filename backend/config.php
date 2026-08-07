<?php

declare(strict_types=1);

/**
 * Carrega as configurações locais sem exigir uma biblioteca externa.
 * Variáveis definidas pelo Apache ou sistema operacional têm prioridade.
 */
function loadEnvironment(): void
{
    $environmentFile = __DIR__ . '/.env';

    if (!is_file($environmentFile)) {
        return;
    }

    $values = parse_ini_file($environmentFile, false, INI_SCANNER_RAW);

    if (!is_array($values)) {
        return;
    }

    foreach ($values as $name => $value) {
        if (getenv((string) $name) === false) {
            putenv($name . '=' . $value);
        }
    }
}

loadEnvironment();

/** Retorna o endereco da aplicacao React usada depois do login. */
function frontendUrl(): string
{
    return rtrim(getenv('FRONTEND_URL') ?: 'http://127.0.0.1:5173', '/');
}

function frontendRoute(string $path = '/'): string
{
    return frontendUrl() . '/' . ltrim($path, '/');
}

/** Abre e reaproveita uma única conexão PDO durante a requisição. */
function database(): PDO
{
    // A variável estática impede a criação de uma conexão a cada consulta.
    static $connection = null;

    if ($connection instanceof PDO) {
        return $connection;
    }

    // Estes valores correspondem à instalação padrão do MySQL no XAMPP.
    $host = getenv('DB_HOST') ?: '127.0.0.1';
    $port = getenv('DB_PORT') ?: '3306';
    $databaseName = getenv('DB_DATABASE') ?: 'infinity_metalique';
    $username = getenv('DB_USERNAME') ?: 'root';
    $password = getenv('DB_PASSWORD') ?: '';
    $dsn = "mysql:host={$host};port={$port};dbname={$databaseName};charset=utf8mb4";

    // Exceções facilitam o tratamento de falhas e prepares reais evitam SQL injection.
    $connection = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $connection;
}
