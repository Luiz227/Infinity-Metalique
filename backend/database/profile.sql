-- Dados pessoais editáveis pelo próprio usuário.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS nickname VARCHAR(50) NULL AFTER name;
