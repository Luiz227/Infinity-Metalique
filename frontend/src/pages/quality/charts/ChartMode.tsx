import { createContext, type ReactNode, useContext, useMemo } from "react"

/**
 * Onde o gráfico está sendo desenhado. São três destinos com geometrias
 * diferentes, e não um "expandido: sim/não":
 *
 * - `inline`: o cartão pequeno da grade, na altura que o visual declarou.
 * - `fullscreen`: a tela cheia, que estica o gráfico até a altura da janela.
 * - `print`: a folha de papel, na altura que sobra depois do cabeçalho.
 *
 * Fica num módulo próprio porque a folha de impressão também precisa do
 * provider: dentro do ChartCard, importá-la de volta fecharia um ciclo.
 */
export type ChartMode = "inline" | "fullscreen" | "print"

/**
 * Altura de partida do gráfico na folha, em px de CSS (96dpi): 186mm de área
 * útil do A4 deitado menos o cabeçalho. A folha mede o que o cartão traz de
 * texto em volta e corrige daqui para baixo antes de imprimir.
 */
export const PRINT_CHART_HEIGHT = 460

/** Abaixo disto o gráfico deixa de ser legível; a folha prefere passar de uma página. */
export const MIN_PRINT_CHART_HEIGHT = 260

type ChartModeState = { mode: ChartMode; printHeight: number }

const ChartModeContext = createContext<ChartModeState>({ mode: "inline", printHeight: PRINT_CHART_HEIGHT })

export const useChartMode = () => useContext(ChartModeContext).mode

/** Altura que a folha reservou para o gráfico. Só faz sentido no modo `print`. */
export const useChartPrintHeight = () => useContext(ChartModeContext).printHeight

/**
 * O papel mostra o mesmo que a tela cheia mostra - inclusive as linhas que o
 * cartão pequeno esconde atrás de um `collapsedLimit`. Só a altura muda entre
 * os dois, e essa quem resolve é o `useChartMode`.
 */
export const useChartExpanded = () => useChartMode() !== "inline"

export function ChartModeProvider({ mode, printHeight = PRINT_CHART_HEIGHT, children }: {
  mode: ChartMode
  printHeight?: number
  children: ReactNode
}) {
  const value = useMemo(() => ({ mode, printHeight }), [mode, printHeight])
  return <ChartModeContext.Provider value={value}>{children}</ChartModeContext.Provider>
}
