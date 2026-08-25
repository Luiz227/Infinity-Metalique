# Registros: um cartão só, tipo escolhido por seletor

Data: 2026-08-24

## Problema

A aba Registros empilhava dois cartões grandes — *RAPs registrados* e *Produtos coletados (RETIR)* —
cada um com título, contagem, paginação e tabela larga de linhas `py-2`. Duas consequências:

1. **Faltava a satisfação.** O terceiro tipo de registro (RSC) só existia na aba Qualidade, embutido
   no gráfico, e sem paginação: `dashboard()` devolve `complaints` com `LIMIT 50` fixo. Quem
   precisava *consultar* satisfações não tinha onde.
2. **A segunda tabela ficava fora da tela.** Medido em 1440×980, o par de cartões ocupava 1223px com
   oito linhas cada — o segundo só aparecia depois de rolar.

Somar um terceiro cartão empilhado pioraria as duas coisas ao mesmo tempo.

## Resultado pretendido

Um cartão só, com o tipo de registro escolhido no lugar onde antes ficava o título de cada seção, e
densidade suficiente para caber uma página inteira de listagem sem rolar.

## Decisões

| Ponto | Decisão | Motivo |
|---|---|---|
| O que o seletor escolhe | O tipo de registro, não as colunas | Ninguém compara RAP com RETIR; quem chega já sabe qual procura |
| Tabela de satisfações | Fica nas duas abas | Em Qualidade ela acompanha o indicador; em Registros ela é consulta paginada. São leituras diferentes do mesmo dado |
| Densidade | Mesmas colunas, linhas mais baixas | Esconder coluna troca um problema por outro: some justo o que a pessoa foi procurar |
| Texto livre | `truncate` com `title` | É o que faz a linha caber numa linha só. Sem isso a densidade da célula não sobrevive a um campo de texto longo |
| Primitivo do seletor | O `Select` da `FilterBar` | Não entra vocabulário visual novo na página |
| Paginação | Números clicáveis, janela de no máximo sete | Anterior/Próxima obriga a passar por todas as páginas até a desejada. A janela impede que 50 páginas empurrem o seletor de tipo |
| Linhas por página | 25 / 50 / 100, valor único para os três tipos | É preferência de leitura, não do tipo. 100 é o teto que o serviço já impunha |
| Aviso de "atualizando" | Removido | O painel já esmaece durante o refetch; a pílula repetia o mesmo recado ocupando o canto |

## Arquitetura

### Backend

`QualityService::complaints()` espelha `reports()` / `dispatches()` — mesmo `complaintConditions()`
no `WHERE`, mesmo teto de `perPage` em 100, mesmo formato de retorno. A rota `complaints.php` fica
sob `permission:quality.view`, como as outras duas listagens: `dashboard.php` já entrega as mesmas
reclamações a quem tem essa permissão, então uma trava mais apertada na rota seria teatro. **A
visibilidade real está na UI**, pela mesma permissão da aba Qualidade.

### Frontend

`RecordTable<T>` é dono de tudo que os três tipos têm em comum: a moldura do cartão, os estados de
carregando/vazio, o `<Scroller>` + `<table>`, e a coluna Ações — que é idêntica nos três, então ela
se monta a partir de `kind`, `onView` e `canDelete` em vez de ser reescrita em cada chamada. Quem
chama só declara `head` e `cells(item)`.

O `ReportsSection` fica com o estado do tipo escolhido; a página não precisa saber qual tabela está
aberta, porque já busca as três em `load()`. As **três páginas continuam separadas**
(`reportsPage`, `dispatchesPage`, `complaintsPage`), para trocar o tipo e voltar não perder o lugar.
O `perPage`, ao contrário, é **um só** e mora na página, porque entra na URL das três buscas.

A lista "Últimas coletas", na aba Produtos Coletados, não acompanha esse seletor: ela é uma vista
fixa das mais recentes. Daí a constante `LATEST_DISPATCHES`, que também é a condição para as duas
abas compartilharem uma requisição — `dispatchesPage === 1 && perPage === LATEST_DISPATCHES`.

## Invariantes

- **A aba Qualidade não muda.** `SatisfactionSection` continua com a lista sob o gráfico.
- **Filtro é um só.** Trocar a barra de filtros devolve os três tipos à primeira página, como já
  fazia com dois.
- **Excluir o último da página volta uma página.** A regra valia para RAP e RETIR e passa a valer
  para satisfação, que antes caía no ramo "não é paginada".
- **`quality.satisfaction` governa a satisfação em toda parte.** Quem não vê a aba não encontra o
  tipo no seletor.
- **Nenhuma coluna sumiu.** Densidade veio de espaçamento e truncamento, não de esconder dado.

## Verificação

1. `php artisan test --filter=QualityApiTest` — inclui `test_lista_satisfacoes_paginadas_e_filtradas`,
   que confere paginação, total, ordem e o 403 sem permissão. Cinco testes, 50 asserções.
2. `npm run build` em `frontend/` (`tsc -b` + `vite build`).
3. Sonda Electron headless renderizando o `ReportsSection` real ao lado da versão anterior, com os
   mesmos dados, em 1440×980:

   | | Antes | Depois |
   |---|---|---|
   | Altura do bloco | 1223px | 416px |
   | Altura da linha | 65px | 38,5px |
   | Linhas visíveis sem rolar | 9 | 16 |

   O seletor abre com as três opções e a contagem acompanha o tipo escolhido.
4. Mesma sonda com 1280 registros (52 páginas): a barra sai `1 2 … 52` na primeira, `1 … 51 52` na
   última e `1 … 50 51 52` no meio; clicar num número troca a fatia (página 51 abre em RAP1251); as
   setas desativam nas pontas; escolher 100 linhas reduz para 13 páginas e volta para a primeira.
