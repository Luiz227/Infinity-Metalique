import { createContext, type ReactNode, useContext } from "react"

import { SERIES } from "./tokens"

/**
 * Cor da série de magnitude do trecho da árvore. Cada aba da qualidade pinta um
 * recorte diferente do mesmo dado, então a cor identifica a seção - e por vir do
 * contexto, quem monta um gráfico fora da view da qualidade (o Dashboard) recebe
 * o vermelho da marca sem precisar declarar nada.
 */
const SeriesColorContext = createContext(SERIES)

export const useSeriesColor = () => useContext(SeriesColorContext)

export function SeriesColorProvider({ color, children }: { color: string; children: ReactNode }) {
  return <SeriesColorContext.Provider value={color}>{children}</SeriesColorContext.Provider>
}
