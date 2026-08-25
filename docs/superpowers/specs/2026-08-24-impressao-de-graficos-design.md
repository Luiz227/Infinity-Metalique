# Impressão de gráficos da Qualidade

Data: 2026-08-24

## Problema

Só documentos iam ao papel. `PrintSheet` monta a folha A4 do RAP, da coleta e do registro de
satisfação, com o cabeçalho da marca e o `@media print` de `quality.css` escondendo o resto do app.

Os gráficos não tinham caminho nenhum para a impressora. Quem abria um gráfico em tela cheia e
queria levar aquela leitura para uma reunião só tinha o print de tela: sem cabeçalho, sem dizer de
qual seção o número veio nem sob qual filtro foi tirado.

## Resultado pretendido

Um botão **Imprimir** dentro da tela cheia, à esquerda do botão **Tabela**, que leva ao papel
exatamente a view em vigor — gráfico ou tabela, com ou sem o recorte de um clique — com o mesmo
cabeçalho dos RAPs.

## Decisões

| Ponto | Decisão | Motivo |
|---|---|---|
| O que vai ao papel | Segundo render dos mesmos filhos, na largura do papel | Foto ou clone do DOM sairia com o texto do eixo em ~6pt |
| Onde fica o botão | Só na tela cheia, à esquerda de Tabela | Pedido explícito; o cartão pequeno mostra um recorte do visual |
| Lado direito do cabeçalho | Nome da seção no lugar do "Número", data abaixo | Mantém o desenho da folha do RAP intacto |
| Contexto | Linha com filtros ativos e recorte clicado | Sem ela o papel não diz de onde os números vieram |
| Orientação | Gráfico deitado, tabela em pé | O gráfico é largo por natureza; a tabela é uma lista |
| Altura do gráfico | Medida na hora, do que sobra da folha | O texto que o cartão traz abaixo do visual varia por cartão |
| Numeração de página | Fora de escopo | Calibrada para retrato com a faixa de assinaturas; o gráfico cabe em uma folha |

## Arquitetura

### Um render por destino, não uma captura

`ChartPrintSheet` é um portal escondido (`left: -10000px`, `visibility: hidden`) com a largura útil
do papel — 273mm deitado, 186mm em pé. Dentro dele, os mesmos `children` do cartão são renderizados
de novo, e o Recharts desenha o SVG já na geometria da folha: o rótulo de 14px sai em ~10pt
impressos, contra os ~6pt de um desenho de 1900px encolhido para caber. É o mesmo princípio do
medidor `.quality-print-measure` que a folha do RAP já usava para contar páginas.

Como são os mesmos filhos, o recorte clicado, a cor da seção e os dados vêm de graça: o que está na
tela é o que vai ao papel, sem nenhum caminho paralelo para divergir.

### Modo do gráfico

`ChartExpandedContext` (booleano) virou `ChartModeContext` com três estados — `inline`,
`fullscreen`, `print` — mais a altura que a folha reservou. `useChartExpanded()` continua existindo
e é verdadeiro nos dois últimos, para o ranking não cortar linhas no papel. O modo mora em
`charts/ChartMode.tsx`, e não no `ChartCard`: a folha também precisa do provider, e importá-la de
volta fecharia um ciclo.

No modo `print` a animação de entrada é desligada. A folha imprime dois quadros depois de montar, e
uma barra a meio caminho dos 0,58s sairia impressa pela metade.

### Ajuste à folha

O cabeçalho tem altura conhecida, mas o texto que cada cartão traz abaixo do visual (as listas de
"Top 3") vem de quem chamou. A folha então se mede: régua de 100mm para o mm→px real, soma das
caixas de gráfico, e o gráfico fica com o que sobra dos 186mm úteis. Sem isso, o cartão com lista
atravessava para uma segunda página com um palmo de gráfico nela — medido: 728px contra 703px de
área útil.

### Cabeçalho compartilhado

O cabeçalho saiu de dentro de `PrintDocument` para `print/PrintHeader.tsx`, com a marcação
idêntica: a folha do RAP está calibrada em milímetro. As partes novas — descrição e linha de
contexto — só renderizam quando vêm preenchidas, então o registro não mudou em nada.

Na visão de tabela, o `<thead>` ganha uma segunda linha com os nomes das colunas, que passam a se
repetir em toda folha junto com o cabeçalho.

### Impressão

`@page` deitado sai de um `<style>` no corpo enquanto a folha existe — vem depois do `quality.css`
na ordem do documento, então vence o retrato. A tela cheia viva é escondida com `display: none` no
papel: é uma caixa fixa do tamanho da janela e renderia uma folha em branco. E o `overflow` do
`html, body` no `@media print` ganhou `!important`, porque a tela cheia tranca a rolagem do corpo
por estilo inline — e estilo inline ganha de regra de folha sem ele.

## Verificação

Medido com Electron headless (`printToPDF` com `preferCSSPageSize`), um caso por processo:

| Caso | Folha | Páginas |
|---|---|---|
| Coluna mensal (gráfico) | A4 deitado 297×210mm | 1 |
| Ranking com lista "Top 3" | A4 deitado, gráfico ajustado de 460px para 429px | 1 |
| Tabela de 60 linhas | A4 em pé 210×297mm | 3, com o cabeçalho redesenhado em cada uma |
| Cartão do Dashboard | A4 deitado, cabeçalho só com a data | 1 |
| Folha do RAP (regressão) | A4 em pé, cabeçalho e assinaturas intactos | 1 |
