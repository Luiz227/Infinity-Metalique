-- Controle de acesso por usuário. Pode ser executado mais de uma vez.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS nickname VARCHAR(50) NULL AFTER name,
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

-- A primeira conta é a administradora principal e sempre possui acesso total.
UPDATE users
SET job_title = 'Administrador', sector = 'Administração', role = 'admin', is_primary_admin = 1, is_active = 1, must_change_password = 0
WHERE email = 'marketing@metalique.com.br';
