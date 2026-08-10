import { ChartCard } from "@/pages/quality/charts/ChartCard"
import { DispatchVsComplaints } from "@/pages/quality/charts/QualityCharts"
import { StatTile } from "@/pages/quality/charts/StatTile"
import { formatDate, formatPercent } from "@/pages/quality/format"
import type { QualityChartSelection, QualityDashboard } from "@/pages/quality/types"

/**
 * Taxa de satisfação: reclamações recebidas sobre o total de saídas no período.
 * O número é a resposta inteira, então ele aparece como valor e não como pizza
 * de duas fatias.
 */
export function SatisfactionSection({ data, highlight, selection, onSelectPeriod }: {
  data: QualityDashboard
  highlight: QualityDashboard | null
  selection: QualityChartSelection | null
  onSelectPeriod: (period: string) => void
}) {
  const { cards } = data
  const selectedPeriod = selection?.filters.year && selection.filters.month
    ? `${selection.filters.year}-${String(selection.filters.month).padStart(2, "0")}`
    : null

  return (
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
        description="As duas séries dividem o mesmo eixo por serem a mesma unidade — um registro."
        help="A distância entre as duas colunas de cada mês é a taxa de satisfação daquele período: reclamação sobre coleta. Um eixo só, sem escala secundária, porque as duas séries contam a mesma coisa — registros. Clique numa coluna para recortar o mês na tabela abaixo."
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
          dispatches={data.dispatchesByPeriod}
          complaints={data.complaintsByPeriod}
          highlightDispatches={selection && highlight ? highlight.dispatchesByPeriod : null}
          highlightComplaints={selection && highlight ? highlight.complaintsByPeriod : null}
          selectedPeriod={selectedPeriod}
          onSelect={onSelectPeriod}
        />
      </ChartCard>

      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.06)]">
        <h3 className="text-[15px] font-semibold text-[#0b0b0b]">Reclamações registradas</h3>
        <p className="mt-1 text-xs text-[#52514e]">
          Base para avaliar se a reclamação é procedente e definir a tratativa.
        </p>

        <div className="mt-4 overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-[#52514e]">
                {["Data", "Cliente", "Máquina", "Modelo", "Ocorrência"].map((head) => (
                  <th key={head} className="border-b border-[#e1e0d9] pb-2 pr-3 font-medium">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.complaints.length === 0 && (
                <tr><td className="py-3 text-[#898781]" colSpan={5}>Nenhuma reclamação no filtro atual.</td></tr>
              )}
              {data.complaints.map((row) => (
                <tr key={row.id} className="border-b border-[#f0efec] last:border-0 align-top">
                  <td className="py-2 pr-3 text-[#52514e] [font-variant-numeric:tabular-nums]">{formatDate(row.complaint_date)}</td>
                  <td className="py-2 pr-3 text-[#0b0b0b]">{row.client ?? "—"}</td>
                  <td className="py-2 pr-3 text-[#52514e]">{row.machine_type ?? "—"}</td>
                  <td className="py-2 pr-3 text-[#52514e]">{row.model ?? "—"}</td>
                  <td className="py-2 text-[#52514e]">{row.problem ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
