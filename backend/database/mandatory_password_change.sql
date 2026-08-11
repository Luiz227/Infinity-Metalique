-- Contas existentes continuam liberadas; somente novas contas recebem o bloqueio.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;

UPDATE users
   SET must_change_password = 0
 WHERE is_primary_admin = 1;
