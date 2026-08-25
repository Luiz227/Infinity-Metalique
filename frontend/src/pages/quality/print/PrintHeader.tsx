import { formatDate } from "@/pages/quality/format"

/**
 * Cabeçalho da marca, o mesmo em toda folha que sai deste sistema: logo e título
 * à esquerda, identificação e data à direita, sobre a linha vermelha.
 *
 * O documento traz o número do registro; o gráfico traz a seção de onde ele foi
 * tirado. Muda o rótulo e o que vai escrito, não o desenho.
 *
 * Os tamanhos são px fixos porque esta folha mede papel, e não tela - a mesma
 * regra que vale para o resto da folha de impressão.
 */
export function PrintHeader({ eyebrow, code, date, title, subtitle, context, pages }: {
  /** Rótulo pequeno acima do identificador: "Número" no registro, "Seção" no gráfico. */
  eyebrow: string
  /** Identificador em destaque. Sem ele, o rótulo fica sozinho sobre a data. */
  code?: string | null
  date: string | null
  title: string
  /** Descrição do gráfico. Os registros não têm uma e não desenham a linha. */
  subtitle?: string
  /** Filtros e recorte em vigor, já reduzidos a uma linha só. */
  context?: string
  /** Total de folhas, quando o documento passa de uma. */
  pages?: number
}) {
  return (
    <div className="quality-print-header flex items-start justify-between gap-6 border-b-2 border-[#db0f0f] pb-4">
      <div>
        <img src="/images/logo.svg" alt="Metalique Infinity" className="h-9 w-auto" />
        <h1 className="mt-3 text-[18px] font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-[12px] leading-snug text-[#52514e]">{subtitle}</p>}
        {context && <p className="mt-1 text-[11px] leading-snug text-[#898781]">{context}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#898781]">{eyebrow}</p>
        {code && <p className="text-[24px] font-semibold leading-tight text-[#db0f0f]">{code}</p>}
        <p className="mt-1 text-[12px] text-[#52514e]">{formatDate(date)}</p>
        {/* Na tela sai o total, e não "Página 1 de N": a view é rolagem
            contínua, sem folhas para numerar. No papel este texto fica
            invisível e só reserva a linha onde a caixa de margem
            `@top-right` pousa o "Página X de Y" de verdade - esse não
            pode sair daqui, porque muda a cada folha e o `<thead>`
            repete sempre o mesmo desenho. */}
        <div className="quality-print-page-slot mt-1 text-[12px] text-[#db0f0f]">
          {pages ? `${pages} páginas` : null}
        </div>
      </div>
    </div>
  )
}

/** Data de hoje no formato do `formatDate`, pelo calendário local e não pelo UTC. */
export function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}
