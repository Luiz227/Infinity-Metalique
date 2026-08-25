import { ChartCard } from "@/pages/quality/charts/ChartCard"
import { RankingBars } from "@/pages/quality/charts/QualityCharts"
import { StatTile } from "@/pages/quality/charts/StatTile"
import type { QualityChartSelection, QualityDashboard, QualityOptions } from "@/pages/quality/types"

/** Onde o erro é mais frequente por produto - direciona ação preventiva por modelo. */
export function ProductsSection({ data, highlight, selection, options, onSelectModel, onSelectMachineType }: {
  data: QualityDashboard
  highlight: QualityDashboard | null
  selection: QualityChartSelection | null
  options: QualityOptions | null
  onSelectModel: (model: string) => void
  onSelectMachineType: (machineType: string) => void
}) {
  const leadingModel = data.reportsByModel[0]
  const leadingMachine = data.reportsByMachineType[0]
  const selectedMachine = options?.machineTypes.find((item) => Number(item.id) === selection?.filters.machineTypeId)?.name ?? null

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total de RAPs" value={data.cards.totalReports} hero hint="Apontamentos no filtro atual" />
        <StatTile
          label="Modelo com mais RAPs"
          value={leadingModel?.label ?? "-"}
          hint={leadingModel ? `${leadingModel.value} apontamentos` : undefined}
        />
        <StatTile
          label="Máquina com mais RAPs"
          value={leadingMachine?.label ?? "-"}
          hint={leadingMachine ? `${leadingMachine.value} apontamentos` : undefined}
        />
        <StatTile label="Modelos registrados" value={data.cards.models} hint={`${data.cards.machineTypes} tipos de máquina`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="RAPs por modelo"
          description="Os modelos com mais apontamentos."
          help="Na visualização normal aparecem os 15 primeiros colocados; abra em tela cheia para consultar todos. Modelo que vende mais aparece mais; o sinal útil é o modelo que sobe de posição sem ter subido de volume. Clique numa barra para recortar os demais gráficos por ele."
          table={{ head: ["Modelo", "RAPs"], rows: data.reportsByModel.map((row) => [row.label, row.value]) }}
        >
          <RankingBars
            animationKey="quality:products:model"
            data={data.reportsByModel}
            measure="RAPs"
            highlightData={selection && highlight ? highlight.reportsByModel : null}
            height={360}
            labelWidth={130}
            selectedLabel={(selection?.filters.model as string | undefined) ?? null}
            onSelect={onSelectModel}
            collapsedLimit={15}
          />
        </ChartCard>

        <ChartCard
          title="RAPs por tipo de máquina"
          description="Linha de produto onde a montagem gera mais não conformidade."
          help="Agrupa os modelos pela linha de produto a que pertencem. É a leitura para decidir onde mexer no processo de montagem, enquanto o gráfico ao lado aponta o modelo específico. Clique numa barra para ver quais modelos daquela linha puxam o número."
          table={{ head: ["Máquina", "RAPs"], rows: data.reportsByMachineType.map((row) => [row.label, row.value]) }}
        >
          <RankingBars
            animationKey="quality:products:machine-type"
            data={data.reportsByMachineType}
            measure="RAPs"
            highlightData={selection && highlight ? highlight.reportsByMachineType : null}
            height={360}
            labelWidth={130}
            selectedLabel={selectedMachine}
            onSelect={onSelectMachineType}
          />
        </ChartCard>
      </div>
    </div>
  )
}
