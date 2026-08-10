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
    job_title VARCHAR(100) NOT NULL DEFAULT 'Colaborador',
    profile_photo VARCHAR(255) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
    is_primary_admin TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    -- O índice garante que o mesmo e-mail não seja cadastrado duas vezes.
    UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Atualiza instalações existentes onde a tabela foi criada antes desta coluna.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(255) NULL AFTER email,
    ADD COLUMN IF NOT EXISTS job_title VARCHAR(100) NOT NULL DEFAULT 'Colaborador' AFTER email,
    ADD COLUMN IF NOT EXISTS role ENUM('admin', 'user') NOT NULL DEFAULT 'user' AFTER password_hash,
    ADD COLUMN IF NOT EXISTS is_primary_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER role,
    ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER is_primary_admin;

CREATE TABLE IF NOT EXISTS user_permissions (
    user_id BIGINT UNSIGNED NOT NULL,
    permission VARCHAR(80) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, permission),
    CONSTRAINT user_permissions_user_foreign
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
