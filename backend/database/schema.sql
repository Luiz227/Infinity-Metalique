-- Cria o banco usando UTF-8 completo para nomes e e-mails com acentos.
CREATE DATABASE IF NOT EXISTS infinity_metalique
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE infinity_metalique;

-- A aplicação armazena somente o hash seguro da senha.
CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL,
    profile_photo VARCHAR(255) NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    -- O índice garante que o mesmo e-mail não seja cadastrado duas vezes.
    UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Atualiza instalações existentes onde a tabela foi criada antes desta coluna.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(255) NULL AFTER email;

-- Solicitações ficam pendentes até que um administrador aprove o acesso.
CREATE TABLE IF NOT EXISTS access_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY access_requests_email_status_index (email, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
