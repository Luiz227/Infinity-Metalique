# Metalique Infinity

Interface inicial do sistema Metalique Infinity desenvolvida em PHP, HTML e CSS.

## Como executar

1. Abra o PowerShell dentro da pasta do projeto.
2. Execute `php -S localhost:8000`.
3. Acesse `http://localhost:8000` no navegador.
4. Clique em **Log-in** ou em **Comece agora!** para abrir a tela de login.

## Estrutura

- `index.php`: página inicial do sistema.
- `login.php`: interface do formulário de login.
- `cadastro.php`: formulário de solicitação de cadastro.
- `assets/css/base.css`: cores, moldura e navegação compartilhadas.
- `assets/css/home.css`: aparência exclusiva da página inicial.
- `assets/css/login.css`: aparência exclusiva da página de login.
- `assets/css/cadastro.css`: formulário e confirmação do cadastro.
- `assets/js/cadastro.js`: abertura e fechamento da confirmação de cadastro.
- `assets/images`: imagens e logotipos fornecidos para o projeto.

> A autenticação ainda não foi conectada ao banco de dados. Nesta etapa, o formulário
> representa somente a interface e está preparado para receber a lógica do backend.
