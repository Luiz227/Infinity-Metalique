# Contrato da API de autenticação

URL local: `http://localhost:8000`

Todas as respostas usam JSON. O frontend deve usar `credentials: 'include'` em todas as requisições para manter o cookie da sessão.

## 1. Obter token CSRF

`GET /csrf.php`

Resposta `200`:

```json
{
  "success": true,
  "csrf_token": "token-gerado-pelo-servidor"
}
```

## 2. Fazer login

`POST /login.php`

Corpo JSON:

```json
{
  "email": "admin@exemplo.com",
  "password": "SenhaSegura123!",
  "csrf_token": "token-obtido-anteriormente"
}
```

Resposta `200`:

```json
{
  "success": true,
  "message": "Login realizado com sucesso.",
  "user": {
    "id": 1,
    "name": "Administrador",
    "email": "admin@exemplo.com"
  }
}
```

Erros possíveis: `401` para credenciais incorretas, `403` para CSRF inválido, `422` para campos inválidos e `429` após muitas tentativas.

## 3. Consultar sessão

`GET /session.php`

```json
{
  "authenticated": true,
  "user": {
    "id": 1,
    "name": "Administrador",
    "email": "admin@exemplo.com"
  }
}
```

Sem login, `authenticated` será `false` e `user` será `null`.

## 4. Fazer logout

`POST /logout.php`

Envie o token CSRF no corpo JSON ou no cabeçalho `X-CSRF-Token`.

```json
{
  "csrf_token": "token-atual-da-sessao"
}
```

## Exemplo para o frontend

```javascript
const csrfRequest = await fetch('http://localhost:8000/csrf.php', {
  credentials: 'include'
});
const { csrf_token } = await csrfRequest.json();

const loginRequest = await fetch('http://localhost:8000/login.php', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, csrf_token })
});

const result = await loginRequest.json();
```
