# Metalique Infinity

Sistema com frontend React e backend PHP conectado ao MySQL.

## Tecnologias

- React, Vite e TypeScript
- Tailwind CSS e componentes shadcn/ui
- Radix UI e ícones Lucide
- PHP com PDO e sessões
- MySQL/MariaDB do XAMPP

## Início rápido

O jeito mais simples de subir o sistema é dar **dois cliques** no arquivo
`iniciar.bat`, que fica na raiz do projeto.

Antes disso, abra o painel de controle do XAMPP e clique em **Start** na linha
do **MySQL**. O script não inicia o banco sozinho: se o MySQL estiver parado,
ele avisa e encerra.

O que o `iniciar.bat` faz, nesta ordem:

1. Confere se o PHP do XAMPP existe em `C:\xampp\php\php.exe`.
2. Confere se o MySQL está respondendo na porta `3306`.
3. Instala as dependências do frontend com `npm install`, se for a primeira vez.
4. Abre duas janelas de terminal e o navegador em `http://127.0.0.1:5173`.

As duas janelas abertas são:

| Janela | O que é | Porta |
| --- | --- | --- |
| `Backend PHP - porta 8082` | Servidor PHP que responde a `/backend` | 8082 |
| `Frontend Vite - porta 5173` | Servidor do React com recarregamento automático | 5173 |

**Para encerrar o sistema, feche as duas janelas.**

Se o seu XAMPP não estiver em `C:\xampp`, abra o `iniciar.bat` em um editor de
texto e corrija o caminho na variável `PHP_EXE`, na linha 11.

## Executar em desenvolvimento

Este é o mesmo processo do `iniciar.bat`, feito à mão. Use quando quiser
acompanhar cada terminal separadamente.

Inicie o **MySQL** no painel do XAMPP. Em um terminal **na raiz do projeto**,
execute o backend:

```powershell
C:\xampp\php\php.exe -S 127.0.0.1:8082
```

> O comando precisa rodar na raiz do projeto, e não dentro de `backend`. O Vite
> encaminha as chamadas de `/backend` e `/assets/uploads` para a porta 8082, e
> esses caminhos só existem a partir da raiz.

Em outro terminal, execute o frontend:

```powershell
cd frontend
npm install
npm run dev
```

Acesse `http://127.0.0.1:5173`.

### Testar como aplicativo desktop

Com o backend PHP e o MySQL em execução, abra outro terminal:

```powershell
cd frontend
npm run desktop:dev
```

O aplicativo abre o Infinity em uma janela desktop. As abas **PipeRun** e
**SIGE** carregam os sistemas dentro do painel principal e mantêm cada sessão
em um armazenamento isolado.

Para gerar o frontend de produção:

```powershell
cd frontend
npm run build
```

## Executar com XAMPP

1. Abra o painel do XAMPP e inicie **Apache** e **MySQL**.
2. Coloque o projeto dentro de `C:\xampp\htdocs\infinity-metalique`.
3. Crie o banco seguindo a seção [Banco de dados e migrações](#banco-de-dados-e-migrações).
4. Gere o frontend de produção com `npm run build`.
5. Acesse `http://localhost/infinity-metalique`.

O banco criado pelos scripts se chama `infinity_metalique`. A configuração
padrão usa:

- Host: `127.0.0.1`
- Porta: `3306`
- Usuário: `root`
- Senha: vazia

Se o seu MySQL usa outros dados, duplique `backend/.env.example` com o nome
`backend/.env` e altere os valores. Esse arquivo local não é enviado ao Git.

## Banco de dados e migrações

### Como funciona

O projeto **não usa nenhum framework de migração** (não há Composer, Artisan,
Prisma ou Alembic). As migrações são arquivos `.sql` guardados em
`backend/database/`, aplicados manualmente com o `mysql.exe` do XAMPP.

Três coisas importantes:

- **Não existe controle automático de versão.** O banco não guarda quais
  migrações já rodaram. Quem controla é você, seguindo a ordem desta seção.
- **Todas as migrações podem ser executadas mais de uma vez.** Elas usam
  `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` e `INSERT IGNORE`,
  então rodar de novo não duplica nem apaga dados. Na dúvida, rode.
- **A ordem importa.** Algumas migrações dependem de colunas ou tabelas criadas
  por outras.

### A regra do comando

Todo comando de migração segue este formato, executado **na raiz do projeto**:

```powershell
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\ARQUIVO.sql
```

Lendo por partes:

| Parte | Para que serve |
| --- | --- |
| `C:\xampp\mysql\bin\mysql.exe` | O cliente MySQL que vem junto com o XAMPP |
| `-u root` | Usuário do banco. Se tiver senha, acrescente `-p` |
| `--default-character-set=utf8mb4` | Evita que acentos virem caracteres quebrados |
| `infinity_metalique` | O banco onde o arquivo será aplicado |
| `< backend\database\ARQUIVO.sql` | Envia o arquivo para o MySQL executar |

> **A única exceção é o `schema.sql`**, que roda **sem** o nome do banco. Ele é
> quem cria o banco, então na primeira execução o `infinity_metalique` ainda não
> existe e passá-lo daria erro. Os arquivos `schema.sql`, `quality.sql` e
> `seed_quality.sql` já trazem `USE infinity_metalique;` escrito dentro deles;
> todos os outros dependem do nome vir pela linha de comando.

### Instalação nova

Para montar o banco do zero, com o MySQL iniciado no XAMPP:

**1. Criar o banco e as tabelas de contas** (repare: sem o nome do banco)

```powershell
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\database\schema.sql
```

**2. Criar as tabelas do setor da qualidade**

```powershell
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\quality.sql
```

**3. Criar a conta do administrador principal pelo sistema**

Suba o sistema, acesse `/solicitar-acesso` e cadastre a conta
`marketing@metalique.com.br`.

**4. Promover essa conta a administradora principal**

```powershell
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\permissions.sql
```

> Este passo vem **depois** do passo 3 de propósito. O `permissions.sql` termina
> com um `UPDATE` que procura a conta pelo e-mail `marketing@metalique.com.br`.
> Se a conta ainda não existir, o `UPDATE` não encontra ninguém e não faz nada —
> por isso, se você rodar fora de ordem, basta rodar o `permissions.sql` de novo
> depois de criar a conta.

Essa conta passa a ter acesso total e não pode ser desativada nem perder o papel
de administradora pela interface.

Nas instalações novas, os outros arquivos `.sql` **não precisam ser executados**:
o `schema.sql` já vem consolidado e contém todas as colunas que eles adicionam.

### Atualizar um banco que já existe

Se o banco foi criado por uma versão antiga do projeto, aplique os arquivos
**nesta ordem**. Todos são seguros de repetir, então pode rodar o bloco inteiro:

```powershell
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\database\schema.sql
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\quality.sql
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\profile.sql
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\permissions.sql
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\user_sectors.sql
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\mandatory_password_change.sql
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\access_request_profile.sql
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\password_reset_requests.sql
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\quality_action_permissions.sql
```

Por que essa ordem:

- `schema.sql` e `quality.sql` criam as tabelas que todas as outras alteram.
- `permissions.sql` cria a coluna `is_primary_admin` e a tabela
  `user_permissions`. `user_sectors.sql`, `mandatory_password_change.sql` e
  `quality_action_permissions.sql` **leem** essas duas coisas, então precisam
  vir depois.

### O que cada migração faz

| Arquivo | O que faz | Quando é necessário |
| --- | --- | --- |
| `schema.sql` | Cria o banco `infinity_metalique` e as tabelas `users`, `user_permissions`, `access_requests` e `password_reset_requests`. Já vem consolidado com todas as colunas das migrações seguintes. | Sempre. É o primeiro. |
| `quality.sql` | Cria as 12 tabelas do setor da qualidade: `clients`, `employees`, `quality_codes`, `machine_types`, `machine_models`, `inspection_reports`, `machine_dispatches`, as tabelas de ligação e fotos, `customer_complaints` e `startup_problems`. | Sempre, depois do `schema.sql`. |
| `permissions.sql` | Adiciona as colunas de conta (`job_title`, `sector`, `role`, `is_primary_admin`, `is_active`, `must_change_password`), cria `user_permissions` e marca `marketing@metalique.com.br` como administradora principal. | Sempre, depois de criar a conta do administrador. |
| `profile.sql` | Adiciona `users.nickname`, o apelido que o usuário edita no próprio perfil. | Só em banco antigo. |
| `user_sectors.sql` | Garante `users.sector` e preenche os setores existentes: `Administração` para o administrador principal e `Qualidade` para quem já tem alguma permissão `quality.*`. | Só em banco antigo, depois do `permissions.sql`. |
| `mandatory_password_change.sql` | Adiciona `users.must_change_password` e dispensa o administrador principal da troca obrigatória de senha. | Só em banco antigo, depois do `permissions.sql`. |
| `access_request_profile.sql` | Adiciona setor, cargo e data de admissão em `access_requests` e torna e-mail e senha opcionais. | Só em banco antigo. **Rodar o `schema.sql` de novo não resolve isso**, porque ele só cria a tabela quando ela ainda não existe. |
| `password_reset_requests.sql` | Cria a tabela `password_reset_requests`, usada na recuperação de senha aprovada pelo administrador. | Só em banco antigo. |
| `quality_action_permissions.sql` | Converte a permissão antiga `quality.manage` nas permissões separadas `quality.create_rap` e `quality.create_dispatch`. | Só em banco antigo, depois do `permissions.sql`. |
| `seed_quality.sql` | Carga de dados gerada a partir da planilha. Não é escrito à mão e não vai para o Git. | Opcional, veja a seção abaixo. |

### Importar a planilha da qualidade

Para carregar os dados da planilha `RELATÓRIO DE INSPEÇÃO.xlsm` no banco:

```powershell
python -m pip install openpyxl
python backend\database\import_quality.py "caminho\RELATÓRIO DE INSPEÇÃO.xlsm"
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 infinity_metalique < backend\database\seed_quality.sql
```

O script Python gera o arquivo `backend/database/seed_quality.sql`, e o terceiro
comando aplica esse arquivo no banco.

> **Atenção:** diferente das migrações, o `seed_quality.sql` **apaga**
> (`TRUNCATE`) as tabelas da qualidade antes de inserir. Rodar de novo substitui
> a carga anterior em vez de duplicá-la — mas também descarta os RAPs e coletas
> que tiverem sido lançados pelo sistema depois da última importação.

O arquivo gerado não vai para o Git.

### Criar uma migração nova

Ao precisar mudar o banco, siga o padrão dos arquivos existentes:

1. Crie um `.sql` em `backend/database/` com nome em `snake_case` descrevendo a
   mudança, por exemplo `user_phone.sql`.
2. Comece com um comentário de uma linha explicando a intenção da mudança.
3. Escreva de forma que possa ser executado mais de uma vez sem quebrar:
   `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS` e `INSERT IGNORE`.
4. **Reflita a mesma mudança no `schema.sql`**, dentro do `CREATE TABLE` e
   também no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. É isso que mantém as
   instalações novas completas sem precisar rodar o histórico inteiro.
5. Adicione o arquivo na tabela desta seção e no bloco de atualização acima.

Exemplo:

```sql
-- Telefone de contato exibido no perfil do colaborador.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL AFTER email;
```

### Problemas comuns

| Mensagem | Causa e solução |
| --- | --- |
| `'C:\xampp\mysql\bin\mysql.exe' não é reconhecido` | O XAMPP não está em `C:\xampp`. Ajuste o caminho no comando. |
| `ERROR 1046 (3D000): No database selected` | Faltou `infinity_metalique` no comando. Só o `schema.sql` roda sem o nome do banco. |
| `ERROR 1049 (42000): Unknown database` | O banco ainda não existe. Rode o `schema.sql` primeiro. |
| `ERROR 1045 (28000): Access denied for user 'root'` | O root tem senha. Acrescente `-p` ao comando e ajuste `backend/.env`. |
| `ERROR 2002: Can't connect to MySQL server` | O MySQL está parado. Inicie no painel do XAMPP. |
| Acentos aparecem como `Ã§` ou `?` | Faltou `--default-character-set=utf8mb4` no comando. |
| `You have an error in your SQL syntax near 'IF NOT EXISTS'` | O banco é MySQL 8 "puro", não o MariaDB do XAMPP. `ADD COLUMN IF NOT EXISTS` só existe no MariaDB; nesse caso aplique as colunas manualmente. |

## Versionamento com Git

### Fluxo do dia a dia

Enviar as alterações do dia para o GitHub:

```powershell
git status
git add .
git commit -m "descrição do commit"
git push origin main
```

O que cada comando faz:

| Comando | O que faz |
| --- | --- |
| `git status` | Mostra o que foi alterado. Sempre olhe antes de continuar. |
| `git add .` | Marca **todos** os arquivos alterados para o próximo commit. |
| `git commit -m "..."` | Salva as alterações no histórico local, com uma descrição. |
| `git push origin main` | Envia os commits locais para o GitHub. |

> **A branch deste projeto se chama `main`, não `master`.** Se você digitar
> `git push origin master`, o Git responde
> `error: src refspec master does not match any`. Para confirmar em qual branch
> você está:
>
> ```powershell
> git branch --show-current
> ```

### Fluxo com tag (marcar uma versão)

A tag é uma etiqueta fixa em um commit, usada para marcar uma versão entregue.
Sequência completa, do início ao fim:

```powershell
git status
git add .
git commit -m "descrição do commit"
git push origin main
git tag v1.0.0 -m "descrição da versão"
git push origin v1.0.0
```

As duas linhas finais:

| Comando | O que faz |
| --- | --- |
| `git tag v1.0.0 -m "descrição da versão"` | Cria a tag no último commit, com uma mensagem descrevendo a versão. |
| `git push origin v1.0.0` | Envia a tag para o GitHub. |

> **A tag precisa de um `push` próprio.** O `git push origin main` envia apenas
> os commits — as tags ficam só na sua máquina até você enviá-las. É por isso
> que a mesma sequência tem dois `push`.

### Convenções do projeto

**Nome da tag:** `vX.Y.Z`, por exemplo `v1.0.0`, `v1.1.0`, `v1.1.1`.

- Aumente o **X** quando a mudança quebrar o que existia antes.
- Aumente o **Y** quando adicionar funcionalidade nova.
- Aumente o **Z** quando for só correção.

**Mensagem do commit:** em português, com um prefixo indicando o tipo:

```powershell
git commit -m "feat: adiciona filtro por período no painel"
git commit -m "fix: corrige total de RAPs por colaborador"
git commit -m "chore: atualiza dependências do frontend"
git commit -m "docs: explica as migrações no README"
git commit -m "feat(qualidade): inclui coluna de setor no RAP"
```

Prefixos usados: `feat` (funcionalidade nova), `fix` (correção), `chore`
(manutenção), `docs` (documentação). O trecho entre parênteses é opcional e
indica a área afetada.

### Comandos úteis

```powershell
git log --oneline                    # histórico resumido, um commit por linha
git tag                              # lista as tags locais
git push origin --tags               # envia todas as tags de uma vez
git show v1.0.0                      # mostra o que a tag marcou
git tag -d v1.0.0                    # apaga a tag local (errou o nome)
git push origin --delete v1.0.0      # apaga a tag no GitHub
git checkout -b feat/nome-da-feature # cria uma branch para trabalhar separado
```

## Setor da qualidade

A rota `/qualidade` reúne os indicadores do setor e o lançamento de RAP e de
Produto Coletado. As tabelas ficam no mesmo banco `infinity_metalique` e são
criadas pelo `quality.sql` — veja
[Banco de dados e migrações](#banco-de-dados-e-migrações).

O painel tem sete seções: RAPs, Unidades, Produtos, Produtos Coletados,
Colaboradores, Qualidade e Registros, todas recortadas pela mesma barra de
filtros. Cada gráfico tem uma tabela equivalente pelo botão **Tabela**, e RAPs e
coletas podem ser impressos ou salvos em PDF pela caixa de impressão do navegador.

Nesta entrega qualquer usuário autenticado acessa a view; a segmentação por área
(marketing, comercial, supervisão) ainda não existe.

O caso de uso detalhado está em `docs/casos-de-uso/qualidade.md`.

## Autenticação

- A solicitação de acesso fica pendente e salva somente o hash da senha escolhida.
- O login usa consulta preparada e `password_verify`.
- Os formulários possuem proteção CSRF.
- A autenticação é mantida em uma sessão PHP com cookie `HttpOnly` e `SameSite=Lax`.
- Usuários autenticados podem atualizar a foto de perfil com arquivos JPG, PNG ou WebP.
- O botão **Sair** encerra a sessão atual.

## Estrutura

- `iniciar.bat`: sobe backend e frontend de uma vez e abre o navegador.
- `frontend`: aplicação React, componentes shadcn/ui e configuração do Vite.
- `frontend/src/pages`: cada tela React organizada em sua própria pasta.
- `frontend/src/styles`: estilos globais e estilos das telas.
- `frontend/public/images`: imagens utilizadas pela interface.
- `frontend/src/components/ui`: componentes visuais baseados em shadcn e Radix.
- `frontend/src/pages/quality`: view da qualidade, seções, formulários e impressão.
- `frontend/src/components/layout`: cabeçalho e moldura compartilhados pelas telas internas.
- `backend/config.php`: configuração e conexão PDO com o MySQL.
- `backend/bootstrap.php`: sessão, CSRF, mensagens e funções compartilhadas.
- `backend/auth.php`: solicitação de acesso, autenticação e sessão do usuário.
- `backend/quality.php`: consultas dos indicadores e gravação de RAPs e coletas.
- `backend/uploads.php`: validação e armazenamento das imagens enviadas.
- `backend/api`: endpoints JSON consumidos pelo React.
- `backend/database`: schema, migrações e importação da planilha.
- `backend/database/schema.sql`: criação do banco e das tabelas de contas.
- `backend/database/quality.sql`: tabelas do setor da qualidade.
- `backend/database/import_quality.py`: importa a planilha do setor para o banco.
- `backend/.env.example`: modelo da configuração local do banco.
- `docs/casos-de-uso`: especificação dos casos de uso do sistema.
- `index.php`, `login.php`, `cadastro.php` e `sistema.php`: redirecionamentos de compatibilidade para as rotas React.
- `assets/uploads`: fotos de perfil e imagens das coletas enviadas pelos usuários.
