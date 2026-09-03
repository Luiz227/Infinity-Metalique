# Caso de Uso - Modulo Qualidade

## UC-QUAL-001 - Gerenciar indicadores e registros da qualidade

### Objetivo

Permitir que usuarios autorizados do setor de qualidade acompanhem indicadores, filtrem informacoes operacionais, registrem RAPs, registrem produtos coletados, imprimam documentos e removam registros quando tiverem permissao para isso.

### Atores

- Usuario autenticado com permissao de acesso ao modulo Qualidade.
- Usuario com permissao para criar RAP.
- Usuario com permissao para criar Produto Coletado.
- Usuario com permissao para registrar Satisfacao do Cliente, que e tambem quem conduz o plano de acao.
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
- Um Registro de Satisfacao do Cliente criado recebe codigo `RSC` gerado pelo sistema e passa a compor a taxa de satisfacao.
- Um Plano de Acao criado recebe codigo `PAC` gerado pelo sistema, fica vinculado a uma unica reclamacao e passa a aparecer na linha dela nas secoes Qualidade e Registros.
- Um Plano de Acao encerrado guarda a data em que a acao terminou, que quase nunca e a data da abertura.
- Um documento selecionado pode ser preparado para impressao ou PDF pelo navegador.
- Um grafico aberto em tela cheia pode ser preparado para impressao ou PDF pelo navegador.
- Um registro excluido deixa de aparecer nas listagens e indicadores.

### Fluxo principal

1. O usuario acessa a rota `/qualidade`.
2. O sistema valida a sessao e as permissoes do usuario.
3. O sistema carrega as opcoes do modulo de qualidade.
4. O sistema carrega os indicadores, RAPs, Produtos Coletados e Registros de Satisfacao conforme filtros atuais.
5. O usuario navega pelas secoes disponiveis para seu perfil:
   - RAPs.
   - Unidades.
   - Produtos.
   - Produtos Coletados.
   - Colaboradores.
   - Qualidade.
   - Planos de acao.
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
4. O usuario adiciona no minimo 1 e no maximo 6 fotos do carregamento.
5. O usuario envia o formulario.
6. O sistema valida CSRF, permissao, campos obrigatorios e quantidade de fotos.
7. O sistema valida e armazena as imagens.
8. O sistema grava o Produto Coletado vinculado ao usuario criador.
9. O sistema retorna mensagem de sucesso com o codigo gerado.
10. O painel recarrega indicadores e listagens.

### Fluxo alternativo C - Registrar Satisfacao do Cliente

1. O usuario com permissao `quality.create_complaint` abre a secao Qualidade e aciona o botao de registro no card de reclamacoes.
2. O sistema abre o formulario de Registro de Satisfacao do Cliente.
3. O usuario informa:
   - Data da reclamacao.
   - Cliente.
   - Tipo de maquina.
   - Modelo, quando aplicavel.
   - Ocorrencia relatada pelo cliente.
   - Tratativa local, quando houver.
   - Alerta da qualidade, quando houver.
4. O usuario envia o formulario.
5. O sistema valida CSRF, permissao e campos obrigatorios.
6. O sistema grava o registro vinculado ao usuario criador, com codigo `RSC` gerado na sequencia.
7. O sistema retorna mensagem de sucesso com o codigo gerado.
8. O painel recarrega indicadores e listagens, recalculando a taxa de satisfacao.

### Fluxo alternativo D - Imprimir registro

1. O usuario acessa a secao Registros, Produtos Coletados ou Qualidade. Na secao Registros os tres
   tipos de documento saem da mesma listagem, conforme o tipo escolhido no seletor.
2. O usuario seleciona a opcao de imprimir um RAP, Produto Coletado ou Registro de Satisfacao do Cliente.
3. O sistema busca os detalhes do documento pelo identificador.
4. O sistema exibe a folha de impressao.
5. O sistema mede a folha na largura util do papel para saber se ela passa de uma pagina.
6. O sistema repete o cabecalho no topo de todas as folhas impressas.
7. O sistema numera as folhas como `Pagina X de Y`, no canto direito do cabecalho, apenas quando o
   documento tem duas folhas ou mais. Documento de uma folha sai sem numeracao.
8. Na folha exibida na tela o sistema mostra apenas o total de paginas, ja que ali o documento e
   rolagem continua e nao tem folhas para numerar.
9. O usuario imprime ou salva em PDF pela caixa de impressao do navegador.

### Fluxo alternativo E - Imprimir grafico

1. O usuario abre um grafico em tela cheia pelo botao de expandir do cartao.
2. O sistema mostra o botao Imprimir a esquerda do botao Tabela. Fora da tela cheia esse botao nao existe.
3. O usuario aciona Imprimir.
4. O sistema monta a folha com o mesmo cabecalho dos registros: logo e titulo do grafico a esquerda, secao
   de origem e data da impressao a direita.
5. O sistema escreve abaixo do titulo a descricao do grafico, os filtros em vigor e o recorte clicado, quando
   houver. No Dashboard, que nao tem abas nem barra de filtros, sai apenas a data.
6. O sistema leva ao papel a vista atual: o grafico ou a tabela, com ou sem recorte, como esta na tela.
7. O sistema mede a folha e ajusta a altura do grafico ao que sobra da pagina, para o cartao que traz texto
   abaixo do visual nao passar para uma segunda folha.
8. O grafico sai em A4 deitado; a tabela sai em A4 em pe, com o cabecalho e os nomes das colunas repetidos
   em todas as folhas.
9. O usuario imprime ou salva em PDF pela caixa de impressao do navegador.

### Fluxo alternativo F - Excluir registro

1. O usuario com permissao de exclusao seleciona a opcao de remover um RAP, Produto Coletado ou Registro de Satisfacao do Cliente.
2. O sistema solicita confirmacao.
3. O usuario confirma a exclusao.
4. O sistema valida CSRF e permissao.
5. O sistema remove o registro.
6. O sistema recarrega a pagina atual da listagem ou volta uma pagina quando a pagina ficou vazia.
7. O sistema exibe mensagem de sucesso.

### Fluxo alternativo G - Configurar catalogos e meta

1. O usuario com permissao `quality.manage` aciona a engrenagem no topo do painel da Qualidade.
2. O sistema abre o painel de configuracoes com tres blocos: meta de RAPs, gates e codigos.
3. O usuario ajusta o que precisar:
   - Meta: maximo de RAPs por mes, ou campo vazio para nao acompanhar meta.
   - Gates: incluir, renomear, reordenar, ativar/desativar ou remover.
   - Codigos: incluir, editar sigla e descricao, reordenar, ativar/desativar ou remover.
4. O usuario aciona Salvar.
5. O sistema valida CSRF, permissao e o conteudo dos catalogos.
6. O sistema grava tudo numa unica transacao e incrementa a revisao da Qualidade.
7. O painel recarrega indicadores e listas, e as demais sessoes abertas se atualizam sozinhas.

### Fluxo alternativo H - Consultar a listagem de registros

1. O usuario com permissao `quality.records` abre a secao Registros.
2. O sistema exibe um unico cartao, com um seletor no lugar do titulo escolhendo o tipo de registro
   em tela: RAPs, Produtos Coletados ou Satisfacoes. Uma listagem aparece por vez.
3. A opcao Satisfacoes so entra no seletor quando o usuario tambem possui `quality.satisfaction`,
   a mesma permissao da secao Qualidade.
4. O sistema mostra ao lado do seletor o total do tipo escolhido dentro do filtro em vigor, e a
   direita o seletor de linhas por pagina e a paginacao.
5. O usuario navega pelas paginas clicando no numero desejado ou nas setas de anterior e proxima.
   A barra mostra a primeira pagina, a ultima e a vizinhanca da atual, com reticencias nos saltos.
6. O usuario escolhe quantas linhas quer por pagina entre 25, 50 e 100.
7. O sistema recarrega as listagens no novo tamanho e devolve os tres tipos para a primeira pagina,
   ja que as fatias mudaram. O seletor de linhas so aparece quando ha mais de 25 registros.
8. O usuario troca o tipo pelo seletor.
9. O sistema mantem a pagina em que cada tipo estava, para o usuario voltar de onde parou.
10. O usuario aplica ou altera um filtro na barra do topo.
11. O sistema recarrega os tres tipos e devolve todos para a primeira pagina.
12. A secao Qualidade continua mostrando as reclamacoes sob o grafico. A listagem de Registros e a
    consulta completa e paginada; a da secao Qualidade acompanha o indicador.

### Fluxo alternativo I - Abrir e conduzir plano de acao

1. O usuario com permissao `quality.create_complaint` abre a secao Planos de acao.
2. O sistema exibe os contadores do filtro em vigor - em aberto, atrasados, concluidos e tempo medio
   de fechamento em dias -, a lista de planos e, abaixo dela, o log com os ultimos andamentos de
   todos os planos do filtro.
3. O usuario aciona Abrir plano de acao.
4. O sistema abre o formulario, que comeca procurando a reclamacao a tratar.
5. O usuario filtra por cliente, tipo de maquina e modelo.
6. O sistema lista apenas as reclamacoes que ainda nao tem plano de acao.
7. O usuario escolhe a reclamacao e informa:
   - Data de abertura do plano.
   - Prazo previsto, quando houver.
   - Responsavel pela acao, quando houver.
   - Causa raiz, quando houver.
   - Acao planejada.
   - Primeiro andamento, quando houver.
8. O sistema valida CSRF, permissao e campos, e grava o plano com codigo `PAC` gerado na sequencia.
9. O sistema abre o log do plano com a linha "Plano de acao aberto." e, quando houver, o primeiro andamento.
10. Enquanto a acao anda, o usuario abre o plano e registra andamentos com a data em que cada coisa
    aconteceu, que pode ser anterior ao dia do lancamento.
11. Concluida a acao, o usuario aciona Encerrar plano e informa a data de conclusao e, quando quiser,
    como foi resolvido.
12. O sistema grava o fechamento, registra quem encerrou e escreve "Plano de acao encerrado." no log.
13. O plano encerrado por engano pode ser reaberto: o sistema limpa a data de fechamento e escreve
    "Plano de acao reaberto." no log, sem perder nenhum andamento.
14. Nas secoes Qualidade e Registros, a linha da reclamacao passa a mostrar o codigo do plano e a
    situacao dele. Reclamacao sem plano mostra, para quem pode tratar, o atalho de abrir um ja com
    ela escolhida.

### Excecoes e regras de negocio

- O acesso ao painel exige permissao `quality.view`.
- Cada secao so aparece quando o usuario possui a permissao correspondente.
- A criacao de RAP exige permissao `quality.create_rap`.
- A criacao de Produto Coletado exige permissao `quality.create_dispatch`.
- A criacao de Registro de Satisfacao do Cliente exige permissao `quality.create_complaint`.
- A exclusao depende de permissao especifica de remocao.
- Toda acao de gravacao ou exclusao exige token CSRF valido.
- A descricao do RAP deve ter conteudo suficiente para caracterizar a ocorrencia.
- O RAP deve possuir ao menos um colaborador envolvido.
- O Produto Coletado deve possuir ao menos um colaborador responsavel.
- O Produto Coletado exige no minimo 1 e no maximo 6 fotos.
- A ocorrencia relatada no Registro de Satisfacao do Cliente deve ter conteudo suficiente para caracterizar a reclamacao.
- O Registro de Satisfacao do Cliente lancado pela tela fica sem chave de origem, para que uma reimportacao da planilha nunca o sobrescreva.
- A secao Planos de acao e a abertura, os andamentos e o fechamento de um plano exigem `quality.create_complaint`, a mesma permissao da reclamacao: quem registra e quem trata.
- Cada reclamacao tem no maximo um plano de acao. Uma segunda tentativa sobre a mesma reclamacao e recusada.
- A situacao do plano nao e um campo: ela sai das datas. Sem fechamento e com prazo vencido, o plano esta atrasado; com fechamento, esta concluido.
- O prazo previsto nao pode ser anterior a abertura, e o fechamento nao pode ser anterior a abertura.
- A data do andamento e digitada e pode ser retroativa: quem trata costuma registrar dias depois o que resolveu em campo. O log e ordenado pela data do andamento, nao pela hora do lancamento.
- Abertura, encerramento e reabertura entram no log como linhas proprias, para a linha do tempo contar a historia inteira sem depender de outra fonte.
- A exclusao do plano exige `quality.manage` e leva os andamentos junto; a reclamacao permanece.
- Excluir a reclamacao exclui o plano de acao vinculado e o log dele.
- O plano fica preso ao identificador da reclamacao, e nao a chave de origem da planilha: uma reimportacao atualiza a reclamacao e mantem o plano.
- Se uma foto falhar durante o envio, o sistema remove as fotos ja armazenadas daquela tentativa para evitar arquivos orfaos.
- A engrenagem de configuracoes exige permissao `quality.manage`, a mesma da exclusao de registros.
- Gate ou codigo ja usado em algum RAP nao pode ser apagado. Ele so pode ser desativado: sai dos formularios novos e continua nos filtros, nos graficos e nos apontamentos ja gravados.
- Gate ou codigo que nunca foi usado pode ser removido de vez.
- A gravacao das configuracoes e atomica: se um item nao puder ser removido, nada da tela e salvo.
- Deve sobrar ao menos um gate ativo e um codigo ativo, senao nao seria possivel lancar um RAP.
- Nomes de gate e siglas de codigo entram normalizados em caixa alta, como no restante do modulo.
- A meta mensal de RAPs e um teto: o valor real precisa ficar abaixo dela. Sem meta definida, os graficos nao exibem a linha e o cartao do mes fica neutro.
- Um gate que chega pela planilha e registrado no catalogo automaticamente, para nao ficar de fora do filtro.
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
| Fotos da coleta | Usuario | Sim | Minimo 1, maximo 6. |
| Data da reclamacao | Usuario | Sim | Usada na taxa de satisfacao por periodo. |
| Ocorrencia relatada | Usuario | Sim | Descreve a reclamacao recebida do cliente. |
| Tratativa local | Usuario | Nao | Registro do que foi feito para atender o cliente. |
| Reclamacao a tratar | Usuario | Sim | Escolhida por cliente, maquina e modelo entre as que ainda nao tem plano. |
| Data de abertura do plano | Usuario | Sim | Inicio da tratativa. |
| Prazo previsto | Usuario | Nao | Vencido e sem fechamento, o plano conta como atrasado. |
| Responsavel pela acao | Usuario | Nao | Colaborador do catalogo. |
| Causa raiz | Usuario | Nao | Analise do porque a ocorrencia aconteceu. |
| Acao planejada | Usuario | Sim | O que sera feito. |
| Data do andamento | Usuario | Sim | Pode ser retroativa; ordena o log. |
| Data de conclusao | Usuario | Sim no fechamento | Quase nunca e a data da abertura. |

### Criterios de aceite

- Ao acessar `/qualidade`, o usuario ve apenas as secoes permitidas para seu perfil.
- Ao aplicar qualquer filtro, todos os indicadores e tabelas sao atualizados de forma consistente.
- Ao selecionar um item de grafico, o sistema exibe comparacao entre subconjunto e total sem perder os filtros principais.
- Ao salvar um RAP valido, o sistema exibe confirmacao e o registro aparece na secao Registros.
- Ao tentar salvar um RAP invalido, o sistema informa o erro e nao grava dados incompletos.
- Ao salvar Produto Coletado sem foto, o sistema bloqueia a gravacao.
- Ao salvar Produto Coletado valido, o sistema armazena as fotos e exibe confirmacao.
- Ao salvar um Registro de Satisfacao do Cliente valido, o sistema exibe confirmacao com o codigo `RSC` e a taxa de satisfacao e recalculada.
- Ao imprimir um registro, a folha carrega os dados completos do RAP, do Produto Coletado ou do Registro de Satisfacao do Cliente.
- Ao imprimir um registro que ocupa mais de uma folha, o cabecalho se repete em todas elas e cada folha recebe `Pagina X de Y`.
- Ao imprimir um registro que cabe em uma folha, nenhuma numeracao de pagina e impressa.
- Ao abrir um grafico em tela cheia, o botao Imprimir aparece a esquerda do botao Tabela; no cartao pequeno ele nao aparece.
- Ao imprimir um grafico, a folha traz o cabecalho da marca com a secao de origem, a data e os filtros em vigor.
- Ao imprimir um grafico com um ponto clicado, a folha sai com o mesmo recorte que esta na tela, e o cabecalho diz qual e.
- Ao imprimir a vista de tabela de um grafico, a folha sai em A4 em pe e o cabecalho e os nomes das colunas se repetem em todas as folhas.
- Ao imprimir um grafico do Dashboard, onde nao ha abas nem filtros, o cabecalho traz apenas a data da impressao.
- Ao abrir um plano de acao valido, o sistema exibe confirmacao com o codigo `PAC` e a linha da reclamacao passa a mostrar o plano nas secoes Qualidade e Registros.
- Ao tentar abrir um segundo plano para a mesma reclamacao, o sistema recusa e explica que ela ja tem um.
- Ao registrar um andamento com data anterior a outro ja lancado, o log o coloca na posicao certa da linha do tempo.
- Ao encerrar um plano com data posterior a abertura, o contador de em aberto cai, o de concluidos sobe e o tempo medio e recalculado.
- Ao encerrar um plano com data anterior a abertura, o sistema recusa e nao grava.
- Ao reabrir um plano encerrado, a data de fechamento e limpa e nenhum andamento se perde.
- Ao imprimir uma reclamacao com plano, a folha traz o bloco do plano e todos os andamentos.
- Ao excluir a reclamacao, o plano de acao e o log dele saem junto.
- Ao excluir um registro, a listagem e os indicadores sao atualizados.
- Ao definir uma meta mensal, o grafico de RAPs por mes exibe a linha pontilhada vermelha, os meses acima dela ficam vermelhos e o cartao do mes mais recente muda de cor.
- Ao adicionar um gate ou codigo, ele passa a aparecer no formulario de RAP sem recarregar a pagina.
- Ao desativar um gate ou codigo, ele sai do formulario de RAP e permanece no filtro e nos graficos.
- Ao tentar remover um gate ou codigo em uso, o sistema informa quantos RAPs o utilizam e nao altera nada.
- Mensagens de erro tecnicas do banco ou servidor nao sao exibidas ao usuario final.

### Roteiro de teste sugerido

1. Entrar com usuario que possui somente visualizacao e confirmar que botoes de criacao/exclusao nao aparecem.
2. Entrar com usuario com permissao de RAP e criar um apontamento completo.
3. Tentar criar RAP sem descricao ou colaborador e confirmar bloqueio.
4. Entrar com usuario com permissao de Produto Coletado e tentar salvar sem foto.
5. Criar Produto Coletado com uma foto valida.
6. Aplicar filtros por ano, mes, barracao, gate e colaborador.
7. Clicar em graficos de RAPs, Produtos e Colaboradores para validar destaque.
8. Entrar com usuario com permissao de Satisfacao do Cliente, registrar uma reclamacao e conferir o recalculo da taxa.
9. Imprimir um RAP, uma coleta e um Registro de Satisfacao do Cliente.
9.1. Abrir um grafico em tela cheia, clicar numa barra e imprimir: a folha sai deitada, em uma pagina, com o
   recorte e os filtros escritos no cabecalho.
9.2. Ligar a vista de tabela num grafico de muitas linhas e imprimir: a folha sai em pe e o cabecalho se
   repete nas folhas seguintes.
10. Excluir um registro com usuario autorizado.
11. Repetir exclusao com usuario sem permissao e confirmar bloqueio.
12. Abrir a engrenagem, definir uma meta mensal baixa e conferir a linha pontilhada e os meses em vermelho.
13. Adicionar um codigo pela engrenagem e confirmar que ele aparece no formulario de Novo RAP.
14. Desativar um gate e confirmar que ele sai do Novo RAP mas continua no filtro e nos graficos.
15. Tentar remover um gate com RAPs lancados e confirmar a mensagem de bloqueio.
16. Entrar com usuario sem `quality.manage` e confirmar que a engrenagem nao aparece.
17. Abrir a secao Planos de acao, acionar Abrir plano de acao, filtrar por cliente e maquina e
    confirmar que so aparecem reclamacoes sem plano.
18. Abrir um plano, lancar dois andamentos com datas diferentes e conferir a ordem no log do plano
    e no painel de ultimos andamentos.
19. Encerrar o plano com data posterior a abertura e conferir os contadores e a coluna da reclamacao
    nas secoes Qualidade e Registros.
20. Abrir um plano com prazo ja vencido e sem fechamento e confirmar que ele conta como atrasado.
21. Reabrir um plano encerrado e confirmar que o log manteve tudo.
22. Imprimir a reclamacao e conferir o bloco do plano com os andamentos; imprimir o `PAC` direto.
23. Entrar com usuario que so tem `quality.satisfaction` e confirmar que a secao Planos de acao nao
    aparece e que a coluna do plano fica somente de leitura.
