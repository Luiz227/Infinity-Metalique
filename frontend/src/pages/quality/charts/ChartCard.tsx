import { createContext, type ReactNode, useContext, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { BarChart3, Info, Maximize2, Minimize2, Table2 } from "lucide-react"

/** Tabela equivalente ao gráfico: todo valor continua acessível sem depender de cor. */
export type ChartTable = { head: string[]; rows: (string | number)[][] }

const ChartExpandedContext = createContext(false)
export const useChartExpanded = () => useContext(ChartExpandedContext)

function Help({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" className="text-[#898781] outline-none transition-colors hover:text-[#0b0b0b] focus-visible:text-[#0b0b0b]" aria-label="Sobre este gráfico">
        <Info className="size-3.5" />
      </button>
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-6 z-50 hidden w-64 -translate-x-1/2 rounded-lg border border-black/10 bg-white p-3 text-xs font-normal leading-snug text-[#52514e] shadow-xl group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  )
}

export function ChartCard({ title, description, help, table, className = "", children }: {
  title: string
  description?: string
  help?: string
  table?: ChartTable
  className?: string
  children: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false) }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [expanded])

  const card = (
    <ChartExpandedContext.Provider value={expanded}>
      <section className={`flex flex-col bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.06)] ${expanded ? "fixed inset-0 z-[100] overflow-auto rounded-none sm:p-8" : `rounded-2xl ${className}`}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-[15px] font-semibold leading-tight text-[#0b0b0b]">
              {title}
              {help && <Help text={help} />}
            </h3>
            {description && <p className="mt-1 text-xs leading-snug text-[#52514e]">{description}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {table && (
              <button type="button" className="flex shrink-0 items-center gap-1 rounded-full border border-black/10 px-2.5 py-1 text-xs text-[#52514e] hover:bg-neutral-50" onClick={() => setShowTable((current) => !current)} aria-pressed={showTable}>
                {showTable ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
                {showTable ? "Gráfico" : "Tabela"}
              </button>
            )}
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full border border-black/10 text-[#52514e] hover:bg-neutral-50" onClick={() => setExpanded((current) => !current)} aria-label={expanded ? "Sair da tela cheia" : "Abrir gráfico em tela cheia"} title={expanded ? "Sair da tela cheia" : "Tela cheia"}>
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </div>
        </div>

        <div className="mt-4 flex-1">
          {showTable && table ? (
            <div className={`${expanded ? "max-h-[calc(100dvh-150px)]" : "max-h-[300px]"} overflow-auto`}>
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr>{table.head.map((cell) => <th key={cell} className="border-b border-[#e1e0d9] pb-2 pr-3 font-medium text-[#52514e]">{cell}</th>)}</tr>
                </thead>
                <tbody className="[font-variant-numeric:tabular-nums]">
                  {table.rows.map((row, index) => (
                    <tr key={index} className="border-b border-[#f0efec] last:border-0">
                      {row.map((cell, cellIndex) => <td key={cellIndex} className="py-2 pr-3 text-[#0b0b0b]">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : children}
        </div>
      </section>
    </ChartExpandedContext.Provider>
  )

  return expanded ? createPortal(card, document.body) : card
}
