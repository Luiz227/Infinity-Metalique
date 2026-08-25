import { useState } from "react"
import { Eye } from "lucide-react"

import { Scroller } from "@/components/ui/scroller"
import { HORIZONTAL_TABLE } from "@/lib/smoothScroll"
import { ChartCard } from "@/pages/quality/charts/ChartCard"
import { DispatchVsComplaints } from "@/pages/quality/charts/QualityCharts"
import { StatTile } from "@/pages/quality/charts/StatTile"
import {
  RecordDeleteButton,
  RecordDeleteDialog,
  type DeleteResult,
  type RecordKind,
  type RecordTarget,
} from "@/pages/quality/RecordDeleteDialog"
import { formatDate, formatPercent } from "@/pages/quality/format"
import { PlanBadge } from "@/pages/quality/PlanBadge"
import type { ComplaintRow, QualityChartSelection, QualityDashboard } from "@/pages/quality/types"

/**
 * Taxa de satisfação: reclamações recebidas sobre o total de saídas no período.
 * O número é a resposta inteira, então ele aparece como valor e não como pizza
 * de duas fatias.
 */
export function SatisfactionSection({
  data,
  highlight,
  selection,
  canDelete,
  onPrint,
  onOpenPlan,
  onDelete,
  onSelectPeriod,
}: {
  data: QualityDashboard
  highlight: QualityDashboard | null
  selection: QualityChartSelection | null
  canDelete: boolean
  onPrint: (id: number) => void
  /** Abre o plano da reclamação, ou o formulário de abertura quando não há um. */
  onOpenPlan: ((complaint: ComplaintRow) => void) | null
  onDelete: (kind: RecordKind, id: number) => Promise<DeleteResult>
  onSelectPeriod: (period: string) => void
}) {
  const { cards } = data
  const selectedPeriod = selection?.filters.year && selection.filters.month
    ? `${selection.filters.year}-${String(selection.filters.month).padStart(2, "0")}`
    : null
  const [deleteTarget, setDeleteTarget] = useState<RecordTarget | null>(null)

  return (
    <>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Taxa de satisfação"
            value={formatPercent(cards.satisfactionRate)}
            hero
            tone="good"
            hint="Coletas sem reclamação sobre o total de coletas"
          />
          <StatTile
            label="Taxa de reclamação"
            value={formatPercent(cards.complaintRate)}
            tone="critical"
            hint="Complemento da taxa de satisfação"
          />
          <StatTile label="Coletas" value={cards.totalDispatches} hint="Saídas de máquina no período" />
          <StatTile label="Reclamações" value={cards.totalComplaints} hint="Registradas pelo cliente" />
        </div>

        <ChartCard
          title="Coletas e reclamações por mês"
          description="As duas séries dividem o mesmo eixo por serem a mesma unidade - um registro."
          help="A distância entre as duas colunas de cada mês é a taxa de satisfação daquele período: reclamação sobre coleta. Um eixo só, sem escala secundária, porque as duas séries contam a mesma coisa - registros. Clique numa coluna para recortar o mês na tabela abaixo."
          table={{
            head: ["Mês", "Coletas", "Reclamações"],
            rows: data.dispatchesByPeriod.map((row) => [
              row.label,
              row.value,
              data.complaintsByPeriod.find((entry) => entry.period === row.period)?.value ?? 0,
            ]),
          }}
        >
          <DispatchVsComplaints
            animationKey="quality:satisfaction:dispatches-vs-complaints"
            dispatches={data.dispatchesByPeriod}
            complaints={data.complaintsByPeriod}
            highlightDispatches={selection && highlight ? highlight.dispatchesByPeriod : null}
            highlightComplaints={selection && highlight ? highlight.complaintsByPeriod : null}
            selectedPeriod={selectedPeriod}
            onSelect={onSelectPeriod}
          />
        </ChartCard>

        <section className="rounded-card border border-hairline bg-surface p-5">
          <h3 className="text-[17px] font-semibold text-ink">Reclamações registradas</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Base para avaliar se a reclamação é procedente e definir a tratativa. A coluna do
            plano de ação diz se ela já foi tratada e em que dia fechou.
          </p>

          <Scroller className="mt-4 overflow-auto" options={HORIZONTAL_TABLE}>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="text-ink-soft">
                  {["Nº", "Data", "Cliente", "Máquina", "Modelo", "Ocorrência", "Plano de ação", "Ações"].map((head) => (
                    <th key={head} className="border-b border-[#e1e0d9] pb-2 pr-3 font-medium">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.complaints.length === 0 && (
                  <tr><td className="py-3 text-ink-muted" colSpan={8}>Nenhuma reclamação no filtro atual.</td></tr>
                )}
                {data.complaints.map((row) => (
                  <tr key={row.id} className="border-b border-[#f0efec] last:border-0 align-top">
                    <td className="py-2 pr-3 font-medium text-ink [font-variant-numeric:tabular-nums]">{row.code ?? "-"}</td>
                    <td className="py-2 pr-3 text-ink-soft [font-variant-numeric:tabular-nums]">{formatDate(row.complaint_date)}</td>
                    <td className="py-2 pr-3 text-ink">{row.client ?? "-"}</td>
                    <td className="py-2 pr-3 text-ink-soft">{row.machine_type ?? "-"}</td>
                    <td className="py-2 pr-3 text-ink-soft">{row.model ?? "-"}</td>
                    <td className="py-2 pr-3 text-ink-soft">{row.problem ?? "-"}</td>
                    <td className="py-2 pr-3"><PlanBadge complaint={row} onOpen={onOpenPlan} /></td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-xs text-ink-soft hover:bg-neutral-50"
                          onClick={() => onPrint(row.id)}
                        >
                          <Eye className="size-3.5" /> Visualizar
                        </button>
                        {canDelete && (
                          <RecordDeleteButton
                            target={{ kind: "complaint", id: row.id, code: row.code }}
                            onSelect={setDeleteTarget}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroller>
        </section>
      </div>

      <RecordDeleteDialog target={deleteTarget} onOpenChange={setDeleteTarget} onDelete={onDelete} />
    </>
  )
}
