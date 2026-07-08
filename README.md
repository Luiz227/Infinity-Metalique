# Backend de login em PHP

Backend de autenticação sem interface pronta. Ele usa PHP 8+, MySQL, PDO, hash seguro de senha, sessão, proteção CSRF, limite de tentativas e respostas JSON.

## Estrutura do MVP

```text
database/       estrutura da tabela MySQL
docs/           contrato para integração com o frontend
public/         endpoints públicos da API
scripts/        criação do primeiro usuário
bootstrap.php   sessão, CORS, CSRF e respostas JSON
config.php      ambiente e conexão PDO com MySQL
```

O contrato que deve ser entregue ao programador da tela está em `docs/API.md`.

## 1. Preparar o computador

Instale o PHP 8 ou superior e confira no terminal:

```powershell
php --version
php -m
```

Na lista de extensões devem aparecer `PDO` e `pdo_mysql`. No Windows, habilite `extension=pdo_mysql` no arquivo `C:\php\php.ini` se necessário.

## 2. Preparar o MySQL na HostGator

1. Crie o banco e o usuário MySQL no painel da hospedagem.
2. Conceda ao usuário acesso ao banco.
3. Abra o phpMyAdmin, selecione o banco, clique em **Importar** e envie `database/schema.sql`.
4. Anote host, porta, nome do banco, usuário e senha.

O phpMyAdmin administra o banco; quem se conecta a ele é o backend por meio do PDO.

## 3. Configurar a conexão

Antes de executar o projeto no PowerShell, defina as variáveis usando os dados reais da HostGator:

```powershell
$env:DB_HOST="localhost"
$env:DB_PORT="3306"
$env:DB_DATABASE="nome_do_banco"
$env:DB_USERNAME="usuario_do_banco"
$env:DB_PASSWORD="senha_do_banco"
```

Para desenvolvimento, copie `.env.example` para `.env` e preencha os dados reais. Esse arquivo está no `.gitignore` e não será enviado ao Git. Na hospedagem, use variáveis de ambiente ou mantenha o `.env` fora da pasta pública.

## 4. Criar o primeiro usuário

Abra o PowerShell na pasta do projeto e execute:

```powershell
php scripts/create-user.php "Administrador" admin@exemplo.com "TroqueEstaSenha123!"
```

O usuário será salvo no MySQL com a senha protegida por hash. Para cadastrar outras pessoas, execute o mesmo comando com outros dados.

## 5. Iniciar o backend

Ainda na pasta do projeto, rode:

```powershell
php -S localhost:8000 -t public
```

O backend ficará disponível em `http://localhost:8000`. Para parar o servidor, pressione `Ctrl + C` no terminal.

## Como o backend funciona

1. `public/csrf.php` fornece o token de segurança da sessão.
2. `public/login.php` valida a requisição, procura o usuário e confere o hash da senha.
3. No sucesso, os dados básicos ficam em `$_SESSION['user']`.
4. `public/session.php` informa se o visitante está autenticado.
5. `public/logout.php` destrói a sessão com segurança.
6. `config.php` conecta ao MySQL usando as variáveis de ambiente.

Depois de cinco senhas incorretas na mesma sessão, novas tentativas ficam bloqueadas por cinco minutos.

## Endpoints

- `GET /`: confirma que o backend está funcionando e lista as rotas.
- `GET /csrf.php`: retorna o token CSRF.
- `POST /login.php`: recebe `email`, `password` e `csrf_token`.
- `GET /session.php`: retorna o estado da autenticação e o usuário atual.
- `POST /logout.php`: recebe o `csrf_token` e encerra a sessão.

## Exemplo de integração com sua tela

O navegador precisa manter o cookie da sessão. Se frontend e backend estiverem em origens diferentes, use `credentials: 'include'` e configure CORS adequadamente.

```javascript
// 1. Busca o token de segurança e mantém o cookie da sessão.
const csrfResponse = await fetch('http://localhost:8000/csrf.php', {
  credentials: 'include'
});
const { csrf_token } = await csrfResponse.json();

// 2. Envia os valores capturados pela sua tela de login.
const response = await fetch('http://localhost:8000/login.php', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@exemplo.com',
    password: 'TroqueEstaSenha123!',
    csrf_token
  })
});

const result = await response.json();
console.log(result);
```

## Produção

Use HTTPS, configure Apache ou Nginx com `public/` como raiz e não exponha `config.php`, `data/` ou `scripts/`. O atraso atual reduz ataques simples, mas um sistema público também deve ter rate limiting por IP/usuário.
