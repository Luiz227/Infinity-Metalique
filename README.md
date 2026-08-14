# Metalique Infinity

Sistema interno com backend Laravel, frontend React/TypeScript e banco
MySQL/MariaDB.

## Arquitetura atual

- Backend: Laravel 13 com PHP 8.3.
- Frontend: React 19, TypeScript e Vite 8.
- Aplicativo desktop: Electron.
- Banco: MySQL/MariaDB do XAMPP.
- Servidor local: Apache do XAMPP na porta 82.
- Autenticação, sessão, CSRF, permissões, usuários e regras de negócio: Laravel.

> O frontend deste repositório não é Next.js 14. Ele é React com Vite. Essa
> escolha mantém o aplicativo Electron existente funcionando sem uma segunda
> migração de arquitetura.

As URLs históricas `/backend/api/*.php` continuam iguais para não quebrar o
frontend, mas agora são rotas Laravel. Não existe mais código PHP legado em
`public/backend`.

## Requisitos

- XAMPP com MySQL/MariaDB iniciado.
- PHP 8.3 ou superior. Os exemplos usam `C:\xampp\php\php.exe`.
- Node.js e npm.
- Composer, caso a pasta `vendor` ainda não exista.
- Python 3, somente para importar a planilha da Qualidade.

## Início rápido

Com o MySQL iniciado no painel do XAMPP, dê dois cliques em `iniciar.bat`.
O script:

1. verifica o PHP, o MySQL e o Apache;
2. executa `php artisan migrate`;
3. instala as dependências do frontend quando necessário;
4. usa o VirtualHost Laravel do Apache na porta 82;
5. inicia o Vite na porta 5173;
6. abre `http://127.0.0.1:5173`.

Para encerrar o frontend, feche a janela do Vite. Apache e MySQL continuam
controlados pelo painel do XAMPP.

## Primeira instalação

Execute os comandos na raiz do projeto:

```powershell
cd C:\Infinity\Infinity-Metalique
Copy-Item .env.example .env
composer install
C:\xampp\php\php.exe artisan key:generate
C:\xampp\php\php.exe artisan migrate

cd frontend
npm install
cd ..
```

Se o arquivo `.env` já existe, não o substitua. Confira nele a conexão com o
banco:

```dotenv
DB_CONNECTION=mariadb
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=infinity_metalique
DB_USERNAME=root
DB_PASSWORD=
```

## Onde executar `php artisan migrate`

O comando sempre deve ser executado na raiz, onde estão os arquivos `artisan`
e `.env`:

```powershell
cd C:\Infinity\Infinity-Metalique
C:\xampp\php\php.exe artisan migrate
```

Comandos úteis:

```powershell
C:\xampp\php\php.exe artisan migrate:status
C:\xampp\php\php.exe artisan migrate
C:\xampp\php\php.exe artisan make:migration nome_da_alteracao
C:\xampp\php\php.exe artisan test
```

A migration-base em `database/migrations` adota o banco
`infinity_metalique` que já existia. Ela preserva os dados, completa a estrutura
necessária e registra o controle na tabela `migrations`.

Não use `artisan migrate:fresh` no banco compartilhado: esse comando apaga as
tabelas. Para mudanças futuras, crie migrations Laravel; não altere o schema
executando manualmente os SQLs históricos.

## Apache do XAMPP na porta 82

O backend usa um VirtualHost separado em `http://127.0.0.1:82`, com o docroot
apontando para `C:/Infinity/Infinity-Metalique/public`. O projeto já configurado
na porta 80 não é alterado.

As configurações ficam em:

- `C:\xampp\apache\conf\httpd.conf`: contém `Listen 0.0.0.0:82`.
- `C:\xampp\apache\conf\extra\httpd-vhosts.conf`: contém o VirtualHost
  `*:82` deste projeto.

Depois de alterar essas configurações, reinicie o Apache pelo painel do XAMPP.
Não é necessário usar `artisan serve` nem `php -S`.

## Executar manualmente em desenvolvimento

Com Apache e MySQL iniciados no XAMPP, aplique as migrations na raiz:

```powershell
C:\xampp\php\php.exe artisan migrate
```

Terminal do frontend:

```powershell
cd C:\Infinity\Infinity-Metalique\frontend
npm install
npm run dev
```

Acesse `http://127.0.0.1:5173`.
O Vite encaminha `/backend` e `/assets/uploads` para o Apache na porta 82.

## Aplicativo desktop

Com o MySQL e o backend em execução, o modo de desenvolvimento é iniciado com:

```powershell
cd frontend
npm run desktop:dev
```

As abas PipeRun e SIGE são abertas dentro do Electron com armazenamento de
sessão isolado.

### Instalador Windows

O Electron funciona como cliente do servidor central. Enquanto a publicação
definitiva não possui domínio, `frontend/server.config.json` usa:

- frontend/Live Share: `http://127.0.0.1:5173`;
- backend Apache: `http://127.0.0.1:82`.

O cliente acessa a porta 5173 e o proxy do Vite encaminha `/backend` e
`/assets/uploads` para a porta 82. As duas portas precisam estar ativas no
computador que hospeda a sessão do Live Share.

Para gerar apenas um instalador local de teste:

```powershell
cd frontend
npm install
npm run desktop:make
```

O instalador assistido é criado em
`frontend/out/nsis/Metalique-Infinity-0.1.0-Setup.exe`. Essa versão de teste
usa a versão do `package.json`, não consulta atualizações e nunca publica uma
nova versão para os usuários.

O instalador permite escolher a pasta de destino e cria os atalhos do
aplicativo. Depois da instalação, a desinstalação fica disponível em
**Configurações > Aplicativos > Aplicativos instalados** do Windows e pelo
atalho do menu Iniciar.

### Versão e atualização de produção

A versão distribuída acompanha o Git somente no processo de produção. Ela é
calculada a partir da última tag no formato `vX.Y.Z` e da quantidade de commits
posteriores. Por exemplo, um commit depois da tag `v0.2.0` produz a versão
`0.2.1`.

Para consultar a versão que seria gerada, sem criar nem publicar arquivos:

```powershell
cd frontend
npm run desktop:version
```

Depois de concluir o commit de produção e enviá-lo para `origin/main`, publique
a atualização com:

```powershell
cd frontend
npm run desktop:release:check
npm run desktop:release
```

O comando de produção é interrompido se a branch atual não for `main`, se
houver arquivos alterados sem commit ou se o commit local ainda não estiver em
`origin/main`. Assim, executar `npm run desktop:make` durante o desenvolvimento
não disponibiliza atualizações aos usuários.

Uma publicação válida coloca o instalador, o arquivo `latest.yml` e o arquivo
de atualização incremental em `public/desktop-updates`. O aplicativo instalado
consulta esse endereço ao iniciar e depois a cada hora. Quando encontra uma
versão mais recente, mostra dentro do próprio aplicativo as ações
**Atualizar agora** e **Instalar e reiniciar**.

Enquanto o servidor central está local, o endereço de atualização é
`http://127.0.0.1:82/desktop-updates`. Ele pode ser alterado em
`frontend/server.config.json` ou pela variável `INFINITY_UPDATE_URL` quando o
servidor de produção receber um domínio.

Na primeira execução, o desktop copia a configuração do servidor para o
diretório de dados do usuário. A variável de ambiente `INFINITY_URL` pode
sobrescrever a URL do frontend e `INFINITY_BACKEND_URL` configura o destino do
proxy ao iniciar o Vite.

## Banco e importação da Qualidade

O Laravel e as migrations em `database/migrations` são a única fonte oficial
do schema. Os antigos SQLs foram removidos do projeto.

Para gerar a carga a partir da planilha:

```powershell
py -3 -m pip install openpyxl
py -3 database\importers\import_quality.py "caminho\RELATÓRIO DE INSPEÇÃO.xlsm"
```

Nesta máquina o Python 3 ainda precisa ser instalado para usar esse importador;
isso não interfere na execução do Laravel nem do frontend.

O script gera `database/importers/seed_quality.sql`. Essa carga é destrutiva:
ela usa `TRUNCATE` nas tabelas da Qualidade. Não a execute sobre dados que
precisem ser preservados.

## Validação

Backend:

```powershell
C:\xampp\php\php.exe artisan migrate:status
C:\xampp\php\php.exe artisan test
vendor\bin\pint --test
```

Frontend:

```powershell
cd frontend
npm run build
```

## Estrutura principal

- `app/Http/Controllers/Api`: endpoints JSON Laravel.
- `app/Http/Middleware`: autenticação, CSRF e permissões da API.
- `app/Models`: modelos Eloquent.
- `app/Services`: regras de Qualidade e uploads.
- `routes/backend.php`: URLs da API consumidas pelo frontend.
- `routes/navigation.php`: redirecionamentos para a interface.
- `database/migrations`: fonte oficial do schema.
- `database/importers`: importadores auxiliares de dados.
- `frontend`: aplicação React/TypeScript com Vite e Electron.
- `public`: front controller Laravel, arquivos estáticos e uploads públicos.
- `tests`: testes automatizados Laravel.
- `.env`: configuração local única do Laravel e do banco.

## Segurança dos uploads

Fotos de perfil e de coletas são validadas pelo Laravel como JPG, PNG ou WebP
e armazenadas em `public/assets/uploads`. Os diretórios mantêm regras próprias
para impedir a execução de scripts enviados como arquivo.
