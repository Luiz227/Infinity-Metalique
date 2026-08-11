-- Cria o banco usando UTF-8 completo para nomes e e-mails com acentos.
CREATE DATABASE IF NOT EXISTS infinity_metalique
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE infinity_metalique;

-- A aplicação armazena somente o hash seguro da senha.
CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    nickname VARCHAR(50) NULL,
    email VARCHAR(254) NOT NULL,
    job_title VARCHAR(100) NOT NULL DEFAULT 'Colaborador',
    sector VARCHAR(120) NOT NULL DEFAULT 'Não informado',
    profile_photo VARCHAR(255) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
    is_primary_admin TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    -- O índice garante que o mesmo e-mail não seja cadastrado duas vezes.
    UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Atualiza instalações existentes onde a tabela foi criada antes desta coluna.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS nickname VARCHAR(50) NULL AFTER name,
    ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(255) NULL AFTER email,
    ADD COLUMN IF NOT EXISTS job_title VARCHAR(100) NOT NULL DEFAULT 'Colaborador' AFTER email,
    ADD COLUMN IF NOT EXISTS sector VARCHAR(120) NOT NULL DEFAULT 'Não informado' AFTER job_title,
    ADD COLUMN IF NOT EXISTS role ENUM('admin', 'user') NOT NULL DEFAULT 'user' AFTER password_hash,
    ADD COLUMN IF NOT EXISTS is_primary_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER role,
    ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER is_primary_admin,
    ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;

CREATE TABLE IF NOT EXISTS user_permissions (
    user_id BIGINT UNSIGNED NOT NULL,
    permission VARCHAR(80) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, permission),
    CONSTRAINT user_permissions_user_foreign
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mantém criação liberada para contas que já possuíam a antiga permissão ampla.
INSERT IGNORE INTO user_permissions (user_id, permission)
SELECT user_id, 'quality.create_rap'
FROM user_permissions
WHERE permission = 'quality.manage';

INSERT IGNORE INTO user_permissions (user_id, permission)
SELECT user_id, 'quality.create_dispatch'
FROM user_permissions
WHERE permission = 'quality.manage';

-- Solicitações ficam pendentes até que um administrador aprove o acesso.
CREATE TABLE IF NOT EXISTS access_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    sector VARCHAR(120) NOT NULL,
    job_title VARCHAR(120) NOT NULL,
    admission_date DATE NOT NULL,
    email VARCHAR(254) NULL,
    password_hash VARCHAR(255) NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY access_requests_email_status_index (email, status),
    KEY access_requests_employee_status_index (name, admission_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    request_token_hash CHAR(64) NOT NULL,
    status ENUM('pending', 'approved', 'rejected', 'completed') NOT NULL DEFAULT 'pending',
    reviewed_by_user_id BIGINT UNSIGNED NULL,
    reviewed_at DATETIME NULL,
    expires_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY password_reset_user_status_index (user_id, status),
    KEY password_reset_status_created_index (status, created_at),
    CONSTRAINT password_reset_user_foreign
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT password_reset_reviewer_foreign
        FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
