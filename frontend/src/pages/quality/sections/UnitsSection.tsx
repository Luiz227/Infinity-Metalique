import { ChartCard } from "@/pages/quality/charts/ChartCard"
import { GateColumns, RankingBars, ShareDonut, TrendLine } from "@/pages/quality/charts/QualityCharts"
import { StatTile } from "@/pages/quality/charts/StatTile"
import type { QualityChartSelection, QualityDashboard } from "@/pages/quality/types"

/** Recorte por barracão e por gate, para agir na unidade e na etapa certas. */
export function UnitsSection({
  data,
  highlight,
  selection,
  onSelectShed,
  onSelectPeriod,
  onSelectGatePeriod,
  onSelectProblemType,
}: {
  data: QualityDashboard
  highlight: QualityDashboard | null
  selection: QualityChartSelection | null
  onSelectShed: (shed: string) => void
  onSelectPeriod: (period: string) => void
  onSelectGatePeriod: (gate: string, period: string) => void
  onSelectProblemType: (problemType: string) => void
}) {
  const gates = [...new Set(data.reportsByGate.map((row) => row.gate))].sort()
  const leadingShed = data.reportsByShed[0]
  const selectedPeriod = selection?.filters.year && selection.filters.month
    ? `${selection.filters.year}-${String(selection.filters.month).padStart(2, "0")}`
    : null

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total de RAPs" value={data.cards.totalReports} hero hint="Apontamentos no filtro atual" />
        <StatTile
          label="Barracão com mais RAPs"
          value={leadingShed?.label ?? "-"}
          hint={leadingShed ? `${leadingShed.value} apontamentos` : undefined}
        />
        <StatTile label="Barracões" value={data.reportsByShed.length} hint="Unidades com registro no período" />
        <StatTile label="Gates" value={gates.length} hint="Etapas de inspeção com apontamento" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Participação por barracão"
          description="Onde os apontamentos se concentram."
          help="A fatia é a parcela de RAPs de cada unidade sobre o total filtrado. Barracão maior produz mais e por isso aparece maior - compare a fatia com o volume produzido antes de concluir que a unidade vai mal. Clique numa fatia para ver esse barracão recortado nos demais gráficos."
          table={{ head: ["Barracão", "RAPs"], rows: data.reportsByShed.map((row) => [row.label, row.value]) }}
        >
          <ShareDonut
            data={data.reportsByShed}
            measure="RAPs"
            highlightData={selection && highlight ? highlight.reportsByShed : null}
            selectedLabel={(selection?.filters.shed as string | undefined) ?? null}
            onSelect={onSelectShed}
          />
        </ChartCard>

        <ChartCard
          title="Evolução mensal"
          description="Piora ou melhora do conjunto filtrado."
          help="A mesma série de RAPs por mês, em linha, para acompanhar a tendência do recorte escolhido. Com um barracão selecionado no gráfico ao lado, a linha vermelha passa a ser só a parcela daquela unidade sobre o total apagado ao fundo."
          table={{ head: ["Mês", "RAPs"], rows: data.reportsByPeriod.map((row) => [row.label, row.value]) }}
        >
          <TrendLine
            data={data.reportsByPeriod}
            measure="RAPs"
            highlightData={selection && highlight ? highlight.reportsByPeriod : null}
            selectedPeriod={selectedPeriod}
            onSelect={onSelectPeriod}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Gates por mês"
        description="Permite agir por etapa: um gate que concentra apontamentos indica falha naquela conferência."
        help="Uma cor por gate, lado a lado em cada mês. O gate é a etapa em que a não conformidade foi pega: quando um deles cresce sozinho, a falha está na conferência daquela etapa, não na montagem inteira. Clique numa coluna para recortar por aquele gate naquele mês."
        table={{
          head: ["Mês", "Gate", "RAPs"],
          rows: data.reportsByGate.map((row) => [row.label, row.gate, row.value]),
        }}
      >
        <GateColumns
          data={data.reportsByGate}
          measure="RAPs"
          highlightData={selection && highlight ? highlight.reportsByGate : null}
          gates={gates}
          selectedGate={(selection?.filters.gate as string | undefined) ?? null}
          selectedPeriod={selectedPeriod}
          onSelect={onSelectGatePeriod}
        />
      </ChartCard>

      <ChartCard
        title="Tipo de problema predominante"
        description="Combine com o filtro de barracão para achar o problema típico de cada unidade."
        help="O mesmo ranking de tipos de problema da aba RAPs, aqui para ser cruzado com a unidade. Selecione um barracão na rosca acima e leia a parcela vermelha de cada barra: é o problema característico daquela unidade, o que dirige o treinamento certo."
        table={{ head: ["Tipo", "RAPs"], rows: data.reportsByProblemType.map((row) => [row.label, row.value]) }}
      >
        <RankingBars
          data={data.reportsByProblemType}
          measure="RAPs"
          highlightData={selection && highlight ? highlight.reportsByProblemType : null}
          height={280}
          labelWidth={175}
          selectedLabel={(selection?.filters.problemType as string | undefined) ?? null}
          onSelect={onSelectProblemType}
        />
      </ChartCard>
    </div>
  )
}
