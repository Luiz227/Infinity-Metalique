<?php

declare(strict_types=1);

// Nome exibido pela aplicação.
const APP_NAME = 'Infinity Metalique';

/**
 * Carrega o arquivo .env local sem precisar instalar bibliotecas externas.
 * Variáveis já configuradas pelo servidor têm prioridade e não são substituídas.
 */
function loadEnvironment(): void
{
    $file = __DIR__ . '/.env';

    if (!is_file($file)) {
        return;
    }

    $values = parse_ini_file($file, false, INI_SCANNER_RAW);

    if (!is_array($values)) {
        return;
    }

    foreach ($values as $name => $value) {
        if (getenv((string) $name) === false) {
            putenv($name . '=' . $value);
        }
    }
}

// Executa a leitura do .env assim que este arquivo é carregado.
loadEnvironment();

/**
 * Abre a conexão com o banco MySQL.
 * A mesma conexão é reaproveitada durante toda a requisição.
 */
function db(): PDO
{
    static $pdo = null;

    // Evita abrir mais de uma conexão na mesma requisição.
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    // As credenciais são lidas do ambiente para não deixar senhas no código.
    $host = getenv('DB_HOST') ?: 'localhost';
    $port = getenv('DB_PORT') ?: '3306';
    $database = getenv('DB_DATABASE') ?: '';
    $username = getenv('DB_USERNAME') ?: '';
    $password = getenv('DB_PASSWORD') ?: '';

    // Interrompe com uma explicação clara se a configuração estiver incompleta.
    if ($database === '' || $username === '') {
        throw new RuntimeException('Configure DB_DATABASE e DB_USERNAME antes de iniciar o backend.');
    }

    // utf8mb4 permite armazenar corretamente acentos, símbolos e emojis.
    $dsn = "mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4";

    // PDO usa prepared statements reais e lança exceções quando ocorre um erro.
    $pdo = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}
