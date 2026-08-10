import { ChartCard } from "@/pages/quality/charts/ChartCard"
import { RankingBars, TrendColumns } from "@/pages/quality/charts/QualityCharts"
import { StatTile } from "@/pages/quality/charts/StatTile"
import type { QualityDashboard } from "@/pages/quality/types"

/** Visão geral dos apontamentos: volume, evolução e onde eles se concentram. */
export function RapsSection({ data }: { data: QualityDashboard }) {
  const { cards } = data

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total de RAPs" value={cards.totalReports} hero hint="Apontamentos no filtro atual" />
        <StatTile label={`RAPs em ${cards.latestPeriodLabel}`} value={cards.latestPeriodReports} hint="Mês mais recente com registro" />
        <StatTile label="Clientes / lotes" value={cards.clients} hint="Distintos entre os apontamentos" />
        <StatTile label="Modelos" value={cards.models} hint={`${cards.machineTypes} tipos de máquina`} />
      </div>

      <ChartCard
        title="RAPs por mês"
        description="Serve para ver se os apontamentos estão caindo ou subindo mês a mês."
        table={{ head: ["Mês", "RAPs"], rows: data.reportsByPeriod.map((row) => [row.label, row.value]) }}
      >
        <TrendColumns data={data.reportsByPeriod} />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Tipo de problema"
          description="Categoria da não conformidade registrada na inspeção."
          table={{ head: ["Tipo", "RAPs"], rows: data.reportsByProblemType.map((row) => [row.label, row.value]) }}
        >
          <RankingBars data={data.reportsByProblemType} height={300} labelWidth={175} />
        </ChartCard>

        <ChartCard
          title="Código atribuído"
          description="Cada código é uma causa padronizada — é por aqui que a ação corretiva é escolhida."
          table={{
            head: ["Código", "Descrição", "RAPs"],
            rows: data.reportsByCode.map((row) => [row.label, row.description ?? "", row.value]),
          }}
        >
          <RankingBars data={data.reportsByCode} height={300} labelWidth={80} />
          <ul className="mt-3 space-y-1 border-t border-[#f0efec] pt-3 text-xs text-[#52514e]">
            {data.reportsByCode.slice(0, 3).map((row) => (
              <li key={row.label}>
                <span className="font-semibold text-[#0b0b0b]">{row.label}</span> — {row.description}
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>
    </div>
  )
}
