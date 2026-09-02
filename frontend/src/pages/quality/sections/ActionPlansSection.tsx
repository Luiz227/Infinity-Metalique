import { useState } from "react"

import { Scroller } from "@/components/ui/scroller"
import { StatTile } from "@/pages/quality/charts/StatTile"
import { formatDate, formatPeriod } from "@/pages/quality/format"
import {
  RecordDeleteDialog,
  type DeleteResult,
  type RecordKind,
  type RecordTarget,
} from "@/pages/quality/RecordDeleteDialog"
import {
  Free,
  Pagination,
  PerPage,
  RecordTable,
} from "@/pages/quality/sections/RecordTable"
import { planStatus, type ActionPlanRow, type ActionPlans } from "@/pages/quality/types"

const STATUS_TONE = {
  closed: "border-green-200 bg-green-50 text-green-800",
  late: "border-red-200 bg-red-50 text-red-700",
  open: "border-hairline bg-white text-ink-soft",
} as const

function StatusTag({ plan }: { plan: ActionPlanRow }) {
  const status = planStatus(plan.due_on, plan.closed_on)

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[status.id]}`}>
      {status.label}
    </span>
  )
}

/**
 * A tratativa das reclamações: um plano por reclamação, aberto num dia e fechado
 * em outro - quase nunca no mesmo.
 *
 * Não tem gráfico de propósito. As outras abas respondem "quantos e por quê";
 * esta é onde se trabalha, e o que ela precisa mostrar é o que está pendente,
 * o que passou do prazo e o que já andou.
 */
export function ActionPlansSection({
  plans,
  page,
  perPage,
  canDelete,
  onPageChange,
  onPerPageChange,
  onOpen,
  onDelete,
}: {
  plans: ActionPlans | null
  page: number
  perPage: number
  canDelete: boolean
  onPageChange: (page: number) => void
  onPerPageChange: (perPage: number) => void
  onOpen: (id: number) => void
  onDelete: (kind: RecordKind, id: number) => Promise<DeleteResult>
}) {
  const [deleteTarget, setDeleteTarget] = useState<RecordTarget | null>(null)
  const cards = plans?.cards

  return (
    <>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Em aberto"
            value={cards?.open ?? "-"}
            hero
            hint="Planos ainda sem data de fechamento"
          />
          <StatTile
            label="Atrasados"
            value={cards?.late ?? "-"}
            tone={cards && cards.late > 0 ? "critical" : "default"}
            hint="Em aberto e com o prazo previsto já vencido"
          />
          <StatTile label="Concluídos" value={cards?.closed ?? "-"} tone="good" hint="Encerrados no filtro atual" />
          <StatTile
            label="Tempo médio"
            value={cards?.averageDays === null || cards?.averageDays === undefined
              ? "-"
              : `${cards.averageDays.toLocaleString("pt-BR")} dias`}
            hint="Da abertura ao fechamento, entre os concluídos"
          />
        </div>

        <section className="rounded-card border border-hairline bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h3 className="text-[15px] font-semibold text-ink">Planos de ação</h3>
              <p className="text-xs text-ink-soft">
                {plans ? `${plans.total} planos no filtro atual.` : "Carregando..."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <PerPage records={plans} perPage={perPage} onPerPageChange={onPerPageChange} />
              <Pagination records={plans} page={page} onPageChange={onPageChange} />
            </div>
          </div>

          <RecordTable
            kind="plan"
            head={["Nº", "Reclamação", "Cliente", "Máquina / modelo", "Responsável", "Abertura", "Prazo", "Fechamento", "Situação"]}
            records={plans}
            empty="Nenhum plano de ação no filtro atual."
            canDelete={canDelete}
            viewLabel="Abrir"
            onView={onOpen}
            onSelectDelete={setDeleteTarget}
            cells={(row) => [
              row.code,
              <span title={row.problem ?? row.no_complaint_note ?? undefined}>
                {row.complaint_code ?? "Sem reclamação"}
              </span>,
              <span className="text-ink">
                {row.no_complaint_month ? formatPeriod(row.no_complaint_month.slice(0, 7)) : row.client ?? "-"}
              </span>,
              `${row.machine_type ?? "-"}${row.model ? ` · ${row.model}` : ""}`,
              <Free value={row.employee} />,
              formatDate(row.opened_on),
              formatDate(row.due_on),
              formatDate(row.closed_on),
              <StatusTag plan={row} />,
            ]}
          />
        </section>

        {/* O log de tudo o que andou, de todos os planos do filtro: é aqui que se
            lê a tratativa do setor sem precisar abrir plano por plano. */}
        <section className="rounded-card border border-hairline bg-surface p-5">
          <h3 className="text-[17px] font-semibold text-ink">Últimos andamentos</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Tudo o que foi registrado nos planos do filtro atual, do mais recente para o mais antigo.
          </p>

          <Scroller className="mt-4 max-h-[420px] overflow-auto">
            <ol className="relative">
              {!plans && <li className="py-3 text-sm text-ink-muted">Carregando andamentos...</li>}
              {plans?.entries.length === 0 && (
                <li className="py-3 text-sm text-ink-muted">Nenhum andamento registrado ainda.</li>
              )}
              {plans?.entries.map((entry) => (
                <li key={entry.id} className="flex gap-3 border-b border-[#f0efec] py-2.5 last:border-0">
                  <span className="w-[86px] shrink-0 pt-0.5 text-xs text-ink-muted [font-variant-numeric:tabular-nums]">
                    {formatDate(entry.entry_date)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{entry.note}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      <button
                        type="button"
                        className="font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
                        onClick={() => onOpen(entry.plan_id)}
                      >
                        {entry.plan_code}
                      </button>
                      {entry.client ? ` · ${entry.client}` : ""}
                      {entry.created_by ? ` · ${entry.created_by}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Scroller>
        </section>
      </div>

      <RecordDeleteDialog target={deleteTarget} onOpenChange={setDeleteTarget} onDelete={onDelete} />
    </>
  )
}
