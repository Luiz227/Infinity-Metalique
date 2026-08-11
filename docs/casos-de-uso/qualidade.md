# Caso de Uso - Modulo Qualidade

## UC-QUAL-001 - Gerenciar indicadores e registros da qualidade

### Objetivo

Permitir que usuarios autorizados do setor de qualidade acompanhem indicadores, filtrem informacoes operacionais, registrem RAPs, registrem produtos coletados, imprimam documentos e removam registros quando tiverem permissao para isso.

### Atores

- Usuario autenticado com permissao de acesso ao modulo Qualidade.
- Usuario com permissao para criar RAP.
- Usuario com permissao para criar Produto Coletado.
- Usuario com permissao para excluir registros.
- Sistema Metalique Infinity.

### Pre-condicoes

- O usuario esta autenticado no sistema.
- O usuario possui ao menos uma permissao relacionada ao modulo Qualidade.
- As tabelas de qualidade estao criadas no banco `infinity_metalique`.
- As listas auxiliares de qualidade estao disponiveis: codigos, colaboradores, tipos de maquina, modelos, clientes, barracoes, anos, gates, setores, tipos de problema e tipos de acao.

### Pos-condicoes

- Os indicadores exibidos respeitam os filtros aplicados pelo usuario.
- Um RAP criado recebe codigo gerado pelo sistema e passa a compor os indicadores e registros.
- Um Produto Coletado criado recebe codigo gerado pelo sistema, guarda suas fotos e passa a compor os indicadores e registros.
- Um documento selecionado pode ser preparado para impressao ou PDF pelo navegador.
- Um registro excluido deixa de aparecer nas listagens e indicadores.

### Fluxo principal

1. O usuario acessa a rota `/qualidade`.
2. O sistema valida a sessao e as permissoes do usuario.
3. O sistema carrega as opcoes do modulo de qualidade.
4. O sistema carrega os indicadores, RAPs e Produtos Coletados conforme filtros atuais.
5. O usuario navega pelas secoes disponiveis para seu perfil:
   - RAPs.
   - Unidades.
   - Produtos.
   - Produtos Coletados.
   - Colaboradores.
   - Qualidade.
   - Registros.
6. O usuario aplica filtros por periodo, barracao, gate, problema, modelo, codigo, tipo de maquina, colaborador ou cliente.
7. O sistema atualiza graficos, cards e tabelas mantendo a consistencia entre as secoes.
8. O usuario clica em uma barra, ponto ou fatia de grafico.
9. O sistema destaca o subconjunto selecionado e permite comparar com o total filtrado.
10. O usuario clica novamente no mesmo destaque.
11. O sistema remove o destaque temporario.

### Fluxo alternativo A - Registrar RAP

1. O usuario com permissao `quality.create_rap` aciona a criacao de novo apontamento.
2. O sistema abre o formulario de RAP.
3. O usuario informa:
   - Data.
   - Identificacao da acao.
   - Cliente ou lote.
   - Tipo de maquina.
   - Modelo, quando aplicavel.
   - Barracao.
   - Area da acao corretiva.
   - Gate.
   - Local da nao conformidade.
   - Codigo do problema.
   - Descricao do ocorrido.
   - Colaboradores envolvidos.
   - Acao imediata, quando houver.
   - Necessidade de atualizar checklist e a alteracao necessaria, quando houver.
4. O usuario envia o formulario.
5. O sistema valida CSRF, permissao e campos obrigatorios.
6. O sistema grava o RAP vinculado ao usuario criador.
7. O sistema retorna mensagem de sucesso com o codigo gerado.
8. O painel recarrega indicadores e listagens.

### Fluxo alternativo B - Registrar Produto Coletado

1. O usuario com permissao `quality.create_dispatch` aciona a criacao de novo Produto Coletado.
2. O sistema abre o formulario de Produto Coletado.
3. O usuario informa:
   - Data da coleta.
   - Cliente.
   - Tipo de maquina.
   - Modelo, quando aplicavel.
   - Ocorrencias durante o carregamento, quando houver.
   - Colaboradores responsaveis.
   - Fotos do carregamento.
   - Acao imediata, quando houver.
   - Necessidade de alterar o formulario de coleta e a alteracao necessaria, quando houver.
4. O usuario adiciona no minimo 2 e no maximo 6 fotos do carregamento.
5. O usuario envia o formulario.
6. O sistema valida CSRF, permissao, campos obrigatorios e quantidade de fotos.
7. O sistema valida e armazena as imagens.
8. O sistema grava o Produto Coletado vinculado ao usuario criador.
9. O sistema retorna mensagem de sucesso com o codigo gerado.
10. O painel recarrega indicadores e listagens.

### Fluxo alternativo C - Imprimir registro

1. O usuario acessa a secao Registros ou Produtos Coletados.
2. O usuario seleciona a opcao de imprimir um RAP ou Produto Coletado.
3. O sistema busca os detalhes do documento pelo identificador.
4. O sistema exibe a folha de impressao.
5. O usuario imprime ou salva em PDF pela caixa de impressao do navegador.

### Fluxo alternativo D - Excluir registro

1. O usuario com permissao de exclusao seleciona a opcao de remover um RAP ou Produto Coletado.
2. O sistema solicita confirmacao.
3. O usuario confirma a exclusao.
4. O sistema valida CSRF e permissao.
5. O sistema remove o registro.
6. O sistema recarrega a pagina atual da listagem ou volta uma pagina quando a pagina ficou vazia.
7. O sistema exibe mensagem de sucesso.

### Excecoes e regras de negocio

- O acesso ao painel exige permissao `quality.view`.
- Cada secao so aparece quando o usuario possui a permissao correspondente.
- A criacao de RAP exige permissao `quality.create_rap`.
- A criacao de Produto Coletado exige permissao `quality.create_dispatch`.
- A exclusao depende de permissao especifica de remocao.
- Toda acao de gravacao ou exclusao exige token CSRF valido.
- A descricao do RAP deve ter conteudo suficiente para caracterizar a ocorrencia.
- O RAP deve possuir ao menos um colaborador envolvido.
- O Produto Coletado deve possuir ao menos um colaborador responsavel.
- O Produto Coletado exige no minimo 2 e no maximo 6 fotos.
- Se uma foto falhar durante o envio, o sistema remove as fotos ja armazenadas daquela tentativa para evitar arquivos orfaos.
- Se o banco estiver indisponivel, o sistema apresenta mensagem de falha sem expor detalhes internos.

### Dados de entrada principais

| Campo | Origem | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| Data do RAP | Usuario | Sim | Usada nos indicadores por periodo. |
| Identificacao | Usuario | Sim | Exemplo: Correcao ou RNC. |
| Cliente / lote | Usuario | Sim | Pode selecionar existente ou digitar novo. |
| Tipo de maquina | Usuario | Sim | Filtra os modelos disponiveis. |
| Modelo | Usuario | Nao | Pode selecionar existente ou digitar novo. |
| Codigo do problema | Usuario | Sim | Alimenta indicador por codigo. |
| Colaboradores | Usuario | Sim | Alimenta indicador individual. |
| Data da coleta | Usuario | Sim | Usada nos indicadores de coleta. |
| Fotos da coleta | Usuario | Sim | Minimo 2, maximo 6. |

### Criterios de aceite

- Ao acessar `/qualidade`, o usuario ve apenas as secoes permitidas para seu perfil.
- Ao aplicar qualquer filtro, todos os indicadores e tabelas sao atualizados de forma consistente.
- Ao selecionar um item de grafico, o sistema exibe comparacao entre subconjunto e total sem perder os filtros principais.
- Ao salvar um RAP valido, o sistema exibe confirmacao e o registro aparece na secao Registros.
- Ao tentar salvar um RAP invalido, o sistema informa o erro e nao grava dados incompletos.
- Ao salvar Produto Coletado com menos de duas fotos, o sistema bloqueia a gravacao.
- Ao salvar Produto Coletado valido, o sistema armazena as fotos e exibe confirmacao.
- Ao imprimir um registro, a folha carrega os dados completos do RAP ou Produto Coletado.
- Ao excluir um registro, a listagem e os indicadores sao atualizados.
- Mensagens de erro tecnicas do banco ou servidor nao sao exibidas ao usuario final.

### Roteiro de teste sugerido

1. Entrar com usuario que possui somente visualizacao e confirmar que botoes de criacao/exclusao nao aparecem.
2. Entrar com usuario com permissao de RAP e criar um apontamento completo.
3. Tentar criar RAP sem descricao ou colaborador e confirmar bloqueio.
4. Entrar com usuario com permissao de Produto Coletado e tentar salvar com apenas uma foto.
5. Criar Produto Coletado com duas fotos validas.
6. Aplicar filtros por ano, mes, barracao, gate e colaborador.
7. Clicar em graficos de RAPs, Produtos e Colaboradores para validar destaque.
8. Imprimir um RAP e uma coleta.
9. Excluir um registro com usuario autorizado.
10. Repetir exclusao com usuario sem permissao e confirmar bloqueio.
