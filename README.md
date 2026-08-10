# Metalique Infinity

Sistema com frontend React e backend PHP conectado ao MySQL.

## Tecnologias

- React, Vite e TypeScript
- Tailwind CSS e componentes shadcn/ui
- Radix UI e ícones Lucide
- PHP com PDO e sessões
- MySQL/MariaDB do XAMPP

## Executar em desenvolvimento

Inicie o **MySQL** no painel do XAMPP. Em um terminal na raiz do projeto, execute o backend:

```powershell
C:\xampp\php\php.exe -S 127.0.0.1:8082
```

Em outro terminal, execute o frontend:

```powershell
cd frontend
npm install
npm run dev
```

Acesse `http://127.0.0.1:5173`.

Para gerar o frontend de produção:

```powershell
cd frontend
npm run build
```

## Executar com XAMPP

1. Abra o painel do XAMPP e inicie **Apache** e **MySQL**.
2. Coloque o projeto dentro de `C:\xampp\htdocs\infinity-metalique`.
3. Acesse `http://localhost/phpmyadmin`.
4. Abra a aba **Importar** e selecione `backend/database/schema.sql`.
5. Acesse `http://localhost/infinity-metalique`.

O banco criado pelo script se chama `infinity_metalique`. A configuração padrão usa:

- Host: `127.0.0.1`
- Porta: `3306`
- Usuário: `root`
- Senha: vazia

Se o seu MySQL usa outros dados, duplique `backend/.env.example` com o nome
`backend/.env` e altere os valores. Esse arquivo local não é enviado ao Git.

## Setor da qualidade

A rota `/qualidade` reúne os indicadores do setor e o lançamento de RAP e de
Produto Coletado. As tabelas ficam no mesmo banco `infinity_metalique`.

Criar as tabelas (uma vez):

```powershell
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\database\quality.sql
```

Importar a planilha `RELATÓRIO DE INSPEÇÃO.xlsm` para o banco:

```powershell
python -m pip install openpyxl
python backend\database\import_quality.py "caminho\RELATÓRIO DE INSPEÇÃO.xlsm"
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\seed_quality.sql
```

O script gera `backend/database/seed_quality.sql` e é idempotente: o SQL limpa as
tabelas da qualidade antes de inserir, então rodar de novo substitui a carga
anterior em vez de duplicá-la. O arquivo gerado não vai para o Git.

O painel tem sete seções — RAPs, Unidades, Produtos, Produtos Coletados,
Colaboradores, Qualidade e Registros — todas recortadas pela mesma barra de
filtros. Cada gráfico tem uma tabela equivalente pelo botão **Tabela**, e RAPs e
coletas podem ser impressos ou salvos em PDF pela caixa de impressão do navegador.

Nesta entrega qualquer usuário autenticado acessa a view; a segmentação por área
(marketing, comercial, supervisão) ainda não existe.

## Autenticação

- A solicitação de acesso fica pendente e salva somente o hash da senha escolhida.
- O login usa consulta preparada e `password_verify`.
- Os formulários possuem proteção CSRF.
- A autenticação é mantida em uma sessão PHP com cookie `HttpOnly` e `SameSite=Lax`.
- Usuários autenticados podem atualizar a foto de perfil com arquivos JPG, PNG ou WebP.
- O botão **Sair** encerra a sessão atual.

## Estrutura

- `frontend`: aplicação React, componentes shadcn/ui e configuração do Vite.
- `frontend/src/pages`: cada tela React organizada em sua própria pasta.
- `frontend/src/styles`: estilos globais e estilos das telas.
- `frontend/public/images`: imagens utilizadas pela interface.
- `frontend/src/components/ui`: componentes visuais baseados em shadcn e Radix.
- `frontend/src/pages/quality`: view da qualidade — seções, formulários e impressão.
- `frontend/src/components/layout`: cabeçalho e moldura compartilhados pelas telas internas.
- `backend/config.php`: configuração e conexão PDO com o MySQL.
- `backend/bootstrap.php`: sessão, CSRF, mensagens e funções compartilhadas.
- `backend/auth.php`: solicitação de acesso, autenticação e sessão do usuário.
- `backend/quality.php`: consultas dos indicadores e gravação de RAPs e coletas.
- `backend/uploads.php`: validação e armazenamento das imagens enviadas.
- `backend/api`: endpoints JSON consumidos pelo React.
- `backend/database/schema.sql`: criação do banco e da tabela `users`.
- `backend/database/quality.sql`: tabelas do setor da qualidade.
- `backend/database/import_quality.py`: importa a planilha do setor para o banco.
- `index.php`, `login.php`, `cadastro.php` e `sistema.php`: redirecionamentos de compatibilidade para as rotas React.
- `assets/uploads`: fotos de perfil enviadas pelos usuários.
