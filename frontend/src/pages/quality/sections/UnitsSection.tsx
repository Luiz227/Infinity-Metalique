import { ChartCard } from "@/pages/quality/charts/ChartCard"
import { GateColumns, RankingBars, ShareDonut, TrendLine } from "@/pages/quality/charts/QualityCharts"
import { StatTile } from "@/pages/quality/charts/StatTile"
import type { QualityDashboard } from "@/pages/quality/types"

/** Recorte por barracão e por gate, para agir na unidade e na etapa certas. */
export function UnitsSection({ data }: { data: QualityDashboard }) {
  const gates = [...new Set(data.reportsByGate.map((row) => row.gate))].sort()
  const leadingShed = data.reportsByShed[0]

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total de RAPs" value={data.cards.totalReports} hero hint="Apontamentos no filtro atual" />
        <StatTile
          label="Barracão com mais RAPs"
          value={leadingShed?.label ?? "—"}
          hint={leadingShed ? `${leadingShed.value} apontamentos` : undefined}
        />
        <StatTile label="Barracões" value={data.reportsByShed.length} hint="Unidades com registro no período" />
        <StatTile label="Gates" value={gates.length} hint="Etapas de inspeção com apontamento" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Participação por barracão"
          description="Onde os apontamentos se concentram."
          table={{ head: ["Barracão", "RAPs"], rows: data.reportsByShed.map((row) => [row.label, row.value]) }}
        >
          <ShareDonut data={data.reportsByShed} />
        </ChartCard>

        <ChartCard
          title="Evolução mensal"
          description="Piora ou melhora do conjunto filtrado."
          table={{ head: ["Mês", "RAPs"], rows: data.reportsByPeriod.map((row) => [row.label, row.value]) }}
        >
          <TrendLine data={data.reportsByPeriod} />
        </ChartCard>
      </div>

      <ChartCard
        title="Gates por mês"
        description="Permite agir por etapa: um gate que concentra apontamentos indica falha naquela conferência."
        table={{
          head: ["Mês", "Gate", "RAPs"],
          rows: data.reportsByGate.map((row) => [row.label, row.gate, row.value]),
        }}
      >
        <GateColumns data={data.reportsByGate} gates={gates} />
      </ChartCard>

      <ChartCard
        title="Tipo de problema predominante"
        description="Combine com o filtro de barracão para achar o problema típico de cada unidade."
        table={{ head: ["Tipo", "RAPs"], rows: data.reportsByProblemType.map((row) => [row.label, row.value]) }}
      >
        <RankingBars data={data.reportsByProblemType} height={280} labelWidth={175} />
      </ChartCard>
    </div>
  )
}
