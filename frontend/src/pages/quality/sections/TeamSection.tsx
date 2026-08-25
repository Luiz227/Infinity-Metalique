import { ChartCard } from "@/pages/quality/charts/ChartCard"
import { RankingBars, ShareDonut, TrendLine } from "@/pages/quality/charts/QualityCharts"
import { StatTile } from "@/pages/quality/charts/StatTile"
import { CODE_COLORS } from "@/pages/quality/charts/tokens"
import type { QualityChartSelection, QualityDashboard, QualityOptions } from "@/pages/quality/types"

/**
 * Desempenho individual. Um RAP pode ter até três colaboradores, então o eixo
 * conta participações, não apontamentos - é o que permite instrução dirigida
 * em vez de treinamento genérico.
 */
export function TeamSection({
  data,
  highlight,
  selection,
  options,
  employeeId,
  onSelectEmployee,
  onSelectCode,
  onSelectPeriod,
}: {
  data: QualityDashboard
  highlight: QualityDashboard | null
  selection: QualityChartSelection | null
  options: QualityOptions | null
  employeeId: number | null
  onSelectEmployee: (id: number | null) => void
  onSelectCode: (code: string) => void
  onSelectPeriod: (period: string) => void
}) {
  const participations = data.reportsByEmployee.reduce((sum, row) => sum + row.value, 0)
  const leading = data.reportsByEmployee[0]
  const leadingCode = data.reportsByCode[0]
  const selected = options?.employees.find((employee) => Number(employee.id) === employeeId)
  const selectedEmployeeRow = selected
    ? data.reportsByEmployee.find((row) => row.label === selected.name)
    : null
  // Ao clicar em uma pessoa, somente a barra dela permanece acesa. A resposta
  // filtrada também traz colegas presentes nos mesmos RAPs, mas exibi-los em
  // vermelho aqui faz parecer que várias pessoas foram selecionadas.
  const employeeHighlight = selected && selectedEmployeeRow
    ? [{ ...selectedEmployeeRow }]
    : selection && highlight ? highlight.reportsByEmployee : null
  const selectedCode = options?.codes.find((code) => Number(code.id) === selection?.filters.codeId)?.code ?? null
  const selectedPeriod = selection?.filters.year && selection.filters.month
    ? `${selection.filters.year}-${String(selection.filters.month).padStart(2, "0")}`
    : null

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Participações" value={participations} hero hint="Atribuições de colaborador nos RAPs" />
        <StatTile label="Colaboradores envolvidos" value={data.reportsByEmployee.length} hint="Pessoas com ao menos um apontamento" />
        <StatTile
          label="Mais recorrente"
          value={leading?.label.split(" ")[0] ?? "-"}
          hint={leading ? `${leading.value} participações` : undefined}
        />
        <StatTile
          label="Código predominante"
          value={leadingCode?.label ?? "-"}
          hint={leadingCode?.description ?? undefined}
        />
      </div>

      <ChartCard
        title="Participações por colaborador"
        description="Clique em uma barra para destacar a participação daquele colaborador nos demais gráficos."
        help="O eixo conta participações, não RAPs: um apontamento com três pessoas atribuídas conta uma vez para cada uma, então a soma das barras passa do total de RAPs. Quem trabalha mais horas aparece mais - o número serve para dirigir instrução, não para ranquear pessoas."
        table={{ head: ["Colaborador", "Participações"], rows: data.reportsByEmployee.map((row) => [row.label, row.value]) }}
      >
          <RankingBars
            animationKey="quality:team:employee"
            data={data.reportsByEmployee}
            measure="participações"
            highlightData={employeeHighlight}
          height={Math.max(280, data.reportsByEmployee.length * 26)}
          labelWidth={230}
          selectedLabel={selected?.name ?? null}
          onSelect={(name) => {
            const employee = options?.employees.find((item) => item.name === name)
            if (employee) onSelectEmployee(Number(employee.id))
          }}
        />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={selected ? `Códigos de ${selected.name}` : "Códigos do conjunto filtrado"}
          description="Diz se o caso é falta de treinamento ou de atenção - e qual instrução dar."
          help="Com um colaborador selecionado no gráfico acima, cada fatia destaca a participação dele naquele código. Códigos concentrados num só ponto indicam falta de treinamento específico; espalhados por todos, falta de atenção."
          table={{
            head: ["Código", "Descrição", "RAPs"],
            rows: data.reportsByCode.map((row) => [row.label, row.description ?? "", row.value]),
          }}
        >
          <ShareDonut
            animationKey="quality:team:code-share"
            data={data.reportsByCode}
            measure="RAPs"
            highlightData={selection && highlight ? highlight.reportsByCode : null}
            height={360}
            selectedLabel={selectedCode}
            centerLabel="Total RAPs"
            showValues
            colorMap={CODE_COLORS}
            onSelect={onSelectCode}
          />
        </ChartCard>

        <ChartCard
          title="Evolução dos apontamentos"
          description="Acompanha se a orientação individual está surtindo efeito."
          help="A linha cheia é a participação do colaborador selecionado mês a mês, sobre a linha cinza do total. Depois de uma orientação, é aqui que se vê o efeito: a linha cheia deve descer enquanto a cinza segue o próprio caminho. A reta tracejada é a tendência linear dessa mesma série - ela fecha a conta que o sobe-e-desce mês a mês não deixa ver."
          table={{ head: ["Mês", "RAPs"], rows: data.reportsByPeriod.map((row) => [row.label, row.value]) }}
        >
          <TrendLine
            animationKey="quality:team:period-trend"
            data={data.reportsByPeriod}
            measure="RAPs"
            highlightData={selection && highlight ? highlight.reportsByPeriod : null}
            selectedPeriod={selectedPeriod}
            onSelect={onSelectPeriod}
          />
        </ChartCard>
      </div>
    </div>
  )
}
