<?php

declare(strict_types=1);

// Usa a mesma conexão e a mesma tabela do backend web.
require_once dirname(__DIR__) . '/config.php';

// Este arquivo só pode ser executado pelo terminal, nunca pelo navegador.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Acesso proibido.\n");
}

// Lê nome, e-mail e senha informados após o nome do script.
[$script, $name, $email, $password] = array_pad($argv, 4, null);
$email = is_string($email) ? filter_var(strtolower(trim($email)), FILTER_VALIDATE_EMAIL) : false;

// Exige dados válidos e uma senha com no mínimo oito caracteres.
if (!$name || !$email || !$password || strlen($password) < 8) {
    exit("Uso: php scripts/create-user.php \"Nome\" email@exemplo.com \"senha-com-8-caracteres\"\n");
}

try {
    // Salva o usuário com um hash de senha forte gerado pelo PHP.
    $statement = db()->prepare('INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :hash)');
    $statement->execute([
        'name' => trim($name),
        'email' => $email,
        'hash' => password_hash($password, PASSWORD_DEFAULT),
    ]);
    echo "Usuário criado com sucesso.\n";
} catch (PDOException $exception) {
    // O código 23000 indica violação de chave única, como e-mail duplicado.
    if ($exception->getCode() === '23000') {
        exit("Já existe um usuário com esse e-mail.\n");
    }
    throw $exception;
}
