import { ChartCard } from "@/pages/quality/charts/ChartCard"
import { RankingBars } from "@/pages/quality/charts/QualityCharts"
import { StatTile } from "@/pages/quality/charts/StatTile"
import type { QualityDashboard } from "@/pages/quality/types"

/** Onde o erro é mais frequente por produto — direciona ação preventiva por modelo. */
export function ProductsSection({ data }: { data: QualityDashboard }) {
  const leadingModel = data.reportsByModel[0]
  const leadingMachine = data.reportsByMachineType[0]

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total de RAPs" value={data.cards.totalReports} hero hint="Apontamentos no filtro atual" />
        <StatTile
          label="Modelo com mais RAPs"
          value={leadingModel?.label ?? "—"}
          hint={leadingModel ? `${leadingModel.value} apontamentos` : undefined}
        />
        <StatTile
          label="Máquina com mais RAPs"
          value={leadingMachine?.label ?? "—"}
          hint={leadingMachine ? `${leadingMachine.value} apontamentos` : undefined}
        />
        <StatTile label="Modelos registrados" value={data.cards.models} hint={`${data.cards.machineTypes} tipos de máquina`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="RAPs por modelo"
          description="Os 15 modelos com mais apontamentos."
          table={{ head: ["Modelo", "RAPs"], rows: data.reportsByModel.map((row) => [row.label, row.value]) }}
        >
          <RankingBars data={data.reportsByModel} height={360} labelWidth={130} />
        </ChartCard>

        <ChartCard
          title="RAPs por tipo de máquina"
          description="Linha de produto onde a montagem gera mais não conformidade."
          table={{ head: ["Máquina", "RAPs"], rows: data.reportsByMachineType.map((row) => [row.label, row.value]) }}
        >
          <RankingBars data={data.reportsByMachineType} height={360} labelWidth={130} />
        </ChartCard>
      </div>
    </div>
  )
}
