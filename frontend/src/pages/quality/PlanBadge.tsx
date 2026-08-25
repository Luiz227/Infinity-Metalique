import { ClipboardCheck, Plus } from "lucide-react"

import { formatDate } from "@/pages/quality/format"
import { planStatus, type ComplaintRow } from "@/pages/quality/types"

/**
 * A situação do plano de ação na linha da reclamação.
 *
 * É o que responde, sem sair da tabela, se aquela reclamação foi tratada e em
 * que dia fechou - a pergunta que o `local_treatment` solto nunca respondeu.
 * Sem plano e com permissão de tratar, a célula vazia vira o atalho para abrir
 * um já com aquela reclamação escolhida.
 */
const TONE = {
  closed: "border-green-200 bg-green-50 text-green-800",
  late: "border-red-200 bg-red-50 text-red-700",
  open: "border-hairline bg-white text-ink-soft",
} as const

export function PlanBadge({ complaint, onOpen }: {
  complaint: ComplaintRow
  onOpen: ((complaint: ComplaintRow) => void) | null
}) {
  if (!complaint.plan_id || !complaint.plan_code) {
    if (!onOpen) return <span className="text-ink-muted">-</span>

    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline-strong px-2 py-0.5 text-[11px] text-ink-muted hover:bg-neutral-50 hover:text-ink-soft"
        onClick={() => onOpen(complaint)}
      >
        <Plus className="size-3" aria-hidden="true" /> Abrir plano
      </button>
    )
  }

  const status = planStatus(complaint.plan_due_on, complaint.plan_closed_on)
  const date = complaint.plan_closed_on ?? complaint.plan_due_on
  const label = complaint.plan_closed_on
    ? `${status.label} ${formatDate(complaint.plan_closed_on)}`
    : date
      ? `${status.label} · prazo ${formatDate(date)}`
      : status.label
  const badge = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${TONE[status.id]}`

  if (!onOpen) {
    return (
      <span className={badge}>
        <ClipboardCheck className="size-3" aria-hidden="true" />
        {complaint.plan_code} · {label}
      </span>
    )
  }

  return (
    <button type="button" className={`${badge} hover:brightness-95`} onClick={() => onOpen(complaint)}>
      <ClipboardCheck className="size-3" aria-hidden="true" />
      {complaint.plan_code} · {label}
    </button>
  )
}
