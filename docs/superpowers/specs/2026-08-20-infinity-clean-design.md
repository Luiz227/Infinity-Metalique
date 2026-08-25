# Infinity clean: gradiente, moldura clara e bordas por linha

Data: 2026-08-20

## Problema

O sistema se apoia em massa de cor: moldura vermelha `#db0f0f` envolvendo um painel `#f2f2f2`,
cabeçalho branco sobre vermelho, cards separados do fundo por sombra. Cada tela abre com um
retângulo saturado ocupando a borda inteira.

Dois obstáculos estruturais impediam a mudança:

1. **Não existia camada de tokens.** O vermelho aparecia como literal `#db0f0f` em 139 lugares,
   em 33 arquivos — inclusive dentro dos primitivos shadcn (`button.tsx`, `input.tsx`,
   `select.tsx`), que deveriam ler do tema.
2. **Home, Login e Solicitar acesso eram layouts absolutos** proporcionais a um frame Figma de
   1788×1005,75, com dezenas de blocos de coordenadas percentuais. Repintar não as deixaria
   clean, porque a composição é que estava cheia.

## Resultado pretendido

Sistema e telas públicas na mesma gramática visual: fundo claro com gradiente suave, moldura
hairline de 1px acompanhando o painel, cards e campos desenhados por borda em vez de sombra. O
vermelho Metalique sobrevive como sotaque — botão primário, pílula ativa, alerta, foco.

## Decisões

| Ponto | Decisão | Motivo |
|---|---|---|
| Escopo | Sistema interno + Login, Home e Solicitar acesso | Uma linguagem só; telas públicas são a primeira impressão |
| Paleta | Neutro com sotaque vermelho | Copiar o lavanda da referência apagaria a marca |
| Bordas | Moldura hairline no painel **e** cards/campos por linha | É o que dá o ar da referência: tudo desenhado a linha |
| Home/Login | Refeitos em fluxo | Layout absoluto não vira clean por repintura |
| Arte da Home | Foto da máquina esmaecida sob o gradiente | Mantém a indústria presente sem competir com o texto |

## Arquitetura visual

### Tokens (`@theme` em `frontend/src/styles/global.css`)

O Tailwind v4 gera um utilitário por entrada: `--color-ink-soft` vira `text-ink-soft`,
`--radius-card` vira `rounded-card`. Os valores de tinta são os mesmos já validados em
`pages/quality/charts/tokens.ts` (`INK`), para que gráfico e interface falem a mesma língua.

- Marca: `metalique`, `metalique-strong`
- Tinta: `ink`, `ink-soft`, `ink-muted`
- Superfícies: `surface` (card), `frame` (moldura), `hairline`, `hairline-strong`
- Raios: `panel` (28px), `card` (16px)

### Gradiente (`.surface-gradient` em `base.css`)

Três camadas: halo da marca a 6% no alto à direita, clarão branco no alto à esquerda, e a
diagonal `#fff → #f5f6f8 → #eceef3`.

O tom final `#eceef3` não é decorativo — é ele que dá contraste para o card **branco** flutuar
sobre o painel. Um gradiente branco-para-branco apagaria os cards.

### Receita do card

`rounded-card border border-hairline bg-surface`, sem sombra.

Em toda superfície branca sobre superfície branca o hairline é obrigatório: sem ele o elemento
desaparece. Vale para o card, para a barra de navegação e para as pílulas de busca e notificação.

## Unidades de trabalho

**A — moldura e cabeçalho.** `AppShell` troca as duas caixas vermelhas por `bg-frame` e dá ao
painel o gradiente com borda. `AppHeader` deixa de ser branco-sobre-vermelho: tinta escura, barra
de navegação com hairline, logo trocado de `logo-b.svg` (versão branca) para `logo.svg`.
`HeaderSearch` e `NotificationsMenu` ganham hairline nas pílulas. `base.css` limpa o vermelho de
`body` e `.page-frame`, senão o overscroll do navegador pisca vermelho.

**B — cards e campos.** `ChartCard` e `StatTile` trocam sombra por borda. `input.tsx` perde a
borda vermelha permanente, que migra para o estado de foco. Primitivos passam a usar os tokens.

**C — varredura.** Os literais restantes viram utilitários de token. `PrintSheet.tsx` e o bloco
`@media print` de `quality.css` ficam de fora de propósito: a folha do RAP vai para papel branco
e tem regras próprias de paginação.

**D — telas públicas.** Home, Login e Solicitar acesso reconstruídas em fluxo: barra superior com
logo, pílulas de navegação e ações; abaixo, um painel único de gradiente com o hero. A foto entra
como camada de fundo desfocada — há precedente em `.auth-machine-image` (`auth.css`), que já faz
isso no login. Some a maior parte das coordenadas absolutas de `home.css` e `auth.css`.

## Invariantes

- **Gráficos não mudam.** A paleta de `charts/tokens.ts` foi validada contra
  `INK.surface = #ffffff` e o card continua branco, então a validação segue valendo.
- **Impressão não muda.** A folha do RAP tem de sair idêntica. Segue valendo para o documento de
  uma folha; o multipágina mudou depois, de propósito, para repetir o cabeçalho e numerar as
  folhas (ver `docs/casos-de-uso/qualidade.md`, fluxo alternativo D).
- **Contraste.** `ink-muted` (`#898781`) precisa passar de 4,5:1 sobre o ponto mais escuro do
  gradiente para texto pequeno.
- **Halo vs. sotaque.** Se o halo vermelho do gradiente passar de 6%, os botões vermelhos perdem
  força. Ajustar o halo, nunca o botão.

## Verificação

1. `npm run build` em `frontend/` (`tsc -b` + `vite build`).
2. Sonda Electron headless lendo `getComputedStyle`: camadas do gradiente, `border-width: 1px` e
   `box-shadow: none` no card, contraste real do `ink-muted` sobre o gradiente.
3. App de verdade: Login → Home → `/sistema` → `/qualidade` (abas, filtros, gráfico em tela
   cheia) → `/usuarios` → diálogo de perfil.
4. Impressão de um RAP, conferindo que a folha continua igual.
