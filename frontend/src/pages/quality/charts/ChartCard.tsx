import { type ReactNode, useState } from "react"
import { BarChart3, Info, Table2 } from "lucide-react"

/** Tabela equivalente ao gráfico: todo valor continua acessível sem depender de cor. */
export type ChartTable = { head: string[]; rows: (string | number)[][] }

/**
 * Explicação longa do visual, no (i) ao lado do título — como no Power BI, ela
 * aparece ao passar o mouse e também no foco de teclado, para quem navega por Tab.
 */
function Help({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        className="text-[#898781] outline-none transition-colors hover:text-[#0b0b0b] focus-visible:text-[#0b0b0b]"
        aria-label="Sobre este gráfico"
      >
        <Info className="size-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-6 z-50 hidden w-64 -translate-x-1/2 rounded-lg border border-black/10 bg-white p-3 text-xs font-normal leading-snug text-[#52514e] shadow-xl group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  )
}

/**
 * Moldura branca de um gráfico: título, descrição e alternância gráfico/tabela.
 * A altura acompanha o conteúdo para que a faixa do eixo X nunca fique cortada.
 */
export function ChartCard({ title, description, help, table, className = "", children }: {
  title: string
  description?: string
  help?: string
  table?: ChartTable
  className?: string
  children: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)

  return (
    <section className={`flex flex-col rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.06)] ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-[15px] font-semibold leading-tight text-[#0b0b0b]">
            {title}
            {help && <Help text={help} />}
          </h3>
          {description && <p className="mt-1 text-xs leading-snug text-[#52514e]">{description}</p>}
        </div>

        {table && (
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 rounded-full border border-black/10 px-2.5 py-1 text-xs text-[#52514e] hover:bg-neutral-50"
            onClick={() => setShowTable((current) => !current)}
            aria-pressed={showTable}
          >
            {showTable ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
            {showTable ? "Gráfico" : "Tabela"}
          </button>
        )}
      </div>

      <div className="mt-4 flex-1">
        {showTable && table ? (
          <div className="max-h-[300px] overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-white">
                <tr>
                  {table.head.map((cell) => (
                    <th key={cell} className="border-b border-[#e1e0d9] pb-2 pr-3 font-medium text-[#52514e]">{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="[font-variant-numeric:tabular-nums]">
                {table.rows.map((row, index) => (
                  <tr key={index} className="border-b border-[#f0efec] last:border-0">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="py-2 pr-3 text-[#0b0b0b]">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
