# Publicacao no Easypanel

## Estrutura

- `frontend`: compila o React e publica a interface com Nginx.
- `backend`: executa Laravel 13 em PHP 8.4 com Apache.
- `database`: executa MariaDB 11.4 sem exposicao publica.
- Os uploads, sessoes e dados do MariaDB ficam em volumes persistentes.

## Preparar o dominio

1. Crie um registro DNS `A`, por exemplo `infinity.empresa.com.br`, apontando para o IP da VPS.
2. Aguarde a propagacao do DNS.

## Criar o projeto

1. No Easypanel, crie um novo projeto.
2. Adicione um servico do tipo **Docker Compose** conectado ao repositorio GitHub.
3. Informe `docker-compose.easypanel.yml` como arquivo Compose.
4. Cadastre as variaveis abaixo na area de ambiente do servico:

```env
APP_URL=https://infinity.empresa.com.br
APP_KEY=base64:CHAVE_GERADA_PELO_LARAVEL
DB_DATABASE=infinity_metalique
DB_USERNAME=infinity
DB_PASSWORD=UMA_SENHA_FORTE_E_EXCLUSIVA
DB_ROOT_PASSWORD=OUTRA_SENHA_FORTE_E_EXCLUSIVA
ONLYOFFICE_JWT_SECRET=UMA_CHAVE_ALEATORIA_FORTE_SEM_CIFRAO
```

Gere `APP_KEY` localmente, sem enviar a chave em mensagens ou ao Git:

```powershell
php artisan key:generate --show
```

## Publicar

1. Execute o deploy do Compose.
2. No servico `frontend`, adicione o dominio e selecione a porta HTTP `80`.
3. Ative HTTPS. O Easypanel emitira e renovara o certificado automaticamente.
4. Nao publique portas do `backend` nem do `database` na internet.
5. Abra `https://infinity.empresa.com.br` e teste login, upload de foto e importacao de planilha.

O Compose tambem inicia o ONLYOFFICE Document Server. Reserve pelo menos 4 GB de RAM na VPS para o editor e use a mesma `ONLYOFFICE_JWT_SECRET` no backend e no servico do editor (o Compose ja faz essa ligacao).

Na primeira inicializacao, o backend aguarda o MariaDB e executa as migrations automaticamente.

## Banco existente

Se a VPS precisar receber os dados que hoje estao no XAMPP, faca um backup antes do primeiro uso e importe o SQL no MariaDB do projeto. O codigo sozinho cria a estrutura, mas nao transfere os usuarios e registros atuais.

## Backup minimo

Configure backups diarios dos volumes `mariadb-data` e `laravel-uploads`. Guarde pelo menos uma copia fora da propria VPS e teste uma restauracao antes de liberar o sistema para uso definitivo.
