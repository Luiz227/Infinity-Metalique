import { ChartCard } from "@/pages/quality/charts/ChartCard"
import { RankingBars, TrendColumns } from "@/pages/quality/charts/QualityCharts"
import { StatTile } from "@/pages/quality/charts/StatTile"
import type { QualityChartSelection, QualityDashboard, QualityOptions } from "@/pages/quality/types"

/** Visão geral dos apontamentos: volume, evolução e onde eles se concentram. */
export function RapsSection({ data, highlight, selection, options, onSelectPeriod, onSelectProblemType, onSelectCode }: {
  data: QualityDashboard
  highlight: QualityDashboard | null
  selection: QualityChartSelection | null
  options: QualityOptions | null
  onSelectPeriod: (period: string) => void
  onSelectProblemType: (problemType: string) => void
  onSelectCode: (code: string) => void
}) {
  const { cards } = data
  const selectedPeriod = selection?.filters.year && selection.filters.month
    ? `${selection.filters.year}-${String(selection.filters.month).padStart(2, "0")}`
    : null
  const selectedCode = options?.codes.find((code) => Number(code.id) === selection?.filters.codeId)?.code ?? null

  // O campeão acompanha o clique: mês, tipo de problema ou código já voltam
  // recortados em `highlight`. O backend usa COALESCE(r.model, '—'), e um RAP sem
  // modelo preenchido não é um modelo — por isso ele não pode liderar o cartão.
  const modelRows = (selection && highlight ? highlight : data).reportsByModel
  const leadingModel = modelRows.find((row) => row.label !== "—")

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total de RAPs" value={cards.totalReports} hero hint="Apontamentos no filtro atual" />
        <StatTile label={`RAPs em ${cards.latestPeriodLabel}`} value={cards.latestPeriodReports} hint="Mês mais recente com registro" />
        <StatTile label="Clientes / lotes" value={cards.clients} hint="Distintos entre os apontamentos" />
        <StatTile
          label="Modelo com mais RAPs"
          value={leadingModel?.label ?? "—"}
          hint={leadingModel
            ? `${leadingModel.value} apontamentos${selection ? ` · ${selection.label}` : ""}`
            : undefined}
        />
      </div>

      <ChartCard
        title="RAPs por mês"
        description="Serve para ver se os apontamentos estão caindo ou subindo mês a mês."
        help="Cada coluna conta os RAPs abertos no mês, dentro do filtro em vigor. Clique numa coluna para recortar os demais gráficos por aquele mês: eles passam a mostrar a parcela do período sobre o total. Uma subida isolada costuma ser lote ou cliente novo; uma subida sustentada por três meses é processo."
        table={{ head: ["Mês", "RAPs"], rows: data.reportsByPeriod.map((row) => [row.label, row.value]) }}
      >
        <TrendColumns
          data={data.reportsByPeriod}
          measure="RAPs"
          highlightData={selection && highlight ? highlight.reportsByPeriod : null}
          selectedPeriod={selectedPeriod}
          onSelect={onSelectPeriod}
        />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Tipo de problema"
          description="Categoria da não conformidade registrada na inspeção."
          help="A categoria escolhida pelo inspetor no momento do apontamento — é a leitura mais grossa da falha. Clique numa barra para ver esse tipo de problema recortado nos outros gráficos e descobrir em qual mês e sob qual código ele se concentra."
          table={{ head: ["Tipo", "RAPs"], rows: data.reportsByProblemType.map((row) => [row.label, row.value]) }}
        >
          <RankingBars
            data={data.reportsByProblemType}
            measure="RAPs"
            height={300}
            labelWidth={175}
            highlightData={selection && highlight ? highlight.reportsByProblemType : null}
            selectedLabel={(selection?.filters.problemType as string | undefined) ?? null}
            onSelect={onSelectProblemType}
          />
        </ChartCard>

        <ChartCard
          title="Código atribuído"
          description="Cada código é uma causa padronizada — é por aqui que a ação corretiva é escolhida."
          help="O código é a causa padronizada do RAP, e não o sintoma: dois problemas diferentes podem cair no mesmo código quando a origem é a mesma. Os três primeiros aparecem descritos abaixo do gráfico. Clique numa barra para ver o mês, o tipo de problema e o modelo ligados àquele código."
          table={{
            head: ["Código", "Descrição", "RAPs"],
            rows: data.reportsByCode.map((row) => [row.label, row.description ?? "", row.value]),
          }}
        >
          <RankingBars
            data={data.reportsByCode}
            measure="RAPs"
            highlightData={selection && highlight ? highlight.reportsByCode : null}
            height={300}
            labelWidth={80}
            selectedLabel={selectedCode}
            onSelect={onSelectCode}
          />
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
