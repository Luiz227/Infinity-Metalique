import { createContext, type ReactNode, useContext } from "react"

/**
 * O que a folha do gráfico sabe além do próprio gráfico: de qual seção ele veio
 * e sob qual recorte foi tirado. O cartão não tem como descobrir nenhum dos
 * dois - a aba e os filtros vivem na view, um nível acima de todos os visuais.
 *
 * O padrão vazio é o do Dashboard, que usa os mesmos cartões sem barra de
 * filtros nem abas: lá o cabeçalho sai só com a data.
 */
export type QualityPrintContext = {
  /** Rótulo da aba: "RAPs", "Unidades", "Produtos Coletados"... */
  section: string | null
  /** Filtros em vigor e o clique ativo, cada um já em texto legível. */
  context: string[]
}

const PrintContext = createContext<QualityPrintContext>({ section: null, context: [] })

export const useQualityPrintContext = () => useContext(PrintContext)

export function QualityPrintProvider({ value, children }: { value: QualityPrintContext; children: ReactNode }) {
  return <PrintContext.Provider value={value}>{children}</PrintContext.Provider>
}
