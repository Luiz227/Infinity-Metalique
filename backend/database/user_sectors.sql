-- O setor identifica a lotação principal; permissões continuam independentes.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS sector VARCHAR(120) NOT NULL DEFAULT 'Não informado' AFTER job_title,
    MODIFY COLUMN sector VARCHAR(120) NOT NULL DEFAULT 'Não informado';

UPDATE users
   SET sector = 'Administração'
 WHERE is_primary_admin = 1;

UPDATE users user_account
   SET sector = 'Qualidade'
 WHERE sector = 'Não informado'
   AND EXISTS (
       SELECT 1
         FROM user_permissions permission
        WHERE permission.user_id = user_account.id
          AND permission.permission LIKE 'quality.%'
   );
