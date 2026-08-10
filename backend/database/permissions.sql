-- Controle de acesso por usuário. Pode ser executado mais de uma vez.
ALTER TABLE users
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

-- A primeira conta é a administradora principal e sempre possui acesso total.
UPDATE users
SET job_title = 'Administrador', role = 'admin', is_primary_admin = 1, is_active = 1
WHERE email = 'marketing@metalique.com.br';
