-- Separa a criação de RAP e coleta da permissão de excluir registros.
-- Pode ser executado mais de uma vez sem duplicar dados.
INSERT IGNORE INTO user_permissions (user_id, permission)
SELECT user_id, 'quality.create_rap'
FROM user_permissions
WHERE permission = 'quality.manage';

INSERT IGNORE INTO user_permissions (user_id, permission)
SELECT user_id, 'quality.create_dispatch'
FROM user_permissions
WHERE permission = 'quality.manage';
