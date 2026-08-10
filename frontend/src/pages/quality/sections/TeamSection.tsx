import { ChartCard } from "@/pages/quality/charts/ChartCard"
import { RankingBars, TrendLine } from "@/pages/quality/charts/QualityCharts"
import { StatTile } from "@/pages/quality/charts/StatTile"
import type { QualityDashboard, QualityOptions } from "@/pages/quality/types"

/**
 * Desempenho individual. Um RAP pode ter até três colaboradores, então o eixo
 * conta participações, não apontamentos — é o que permite instrução dirigida
 * em vez de treinamento genérico.
 */
export function TeamSection({ data, options, employeeId, onSelectEmployee }: {
  data: QualityDashboard
  options: QualityOptions | null
  employeeId: number | null
  onSelectEmployee: (id: number | null) => void
}) {
  const participations = data.reportsByEmployee.reduce((sum, row) => sum + row.value, 0)
  const leading = data.reportsByEmployee[0]
  const leadingCode = data.reportsByCode[0]
  const selected = options?.employees.find((employee) => Number(employee.id) === employeeId)

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Participações" value={participations} hero hint="Atribuições de colaborador nos RAPs" />
        <StatTile label="Colaboradores envolvidos" value={data.reportsByEmployee.length} hint="Pessoas com ao menos um apontamento" />
        <StatTile
          label="Mais recorrente"
          value={leading?.label.split(" ")[0] ?? "—"}
          hint={leading ? `${leading.value} participações` : undefined}
        />
        <StatTile
          label="Código predominante"
          value={leadingCode?.label ?? "—"}
          hint={leadingCode?.description ?? undefined}
        />
      </div>

      <ChartCard
        title="Participações por colaborador"
        description="Clique em um nome na lista abaixo para ver o código predominante daquela pessoa."
        table={{ head: ["Colaborador", "Participações"], rows: data.reportsByEmployee.map((row) => [row.label, row.value]) }}
      >
        <RankingBars data={data.reportsByEmployee} height={Math.max(280, data.reportsByEmployee.length * 26)} labelWidth={230} />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={selected ? `Códigos de ${selected.name}` : "Códigos do conjunto filtrado"}
          description="Diz se o caso é falta de treinamento ou de atenção — e qual instrução dar."
          table={{
            head: ["Código", "Descrição", "RAPs"],
            rows: data.reportsByCode.map((row) => [row.label, row.description ?? "", row.value]),
          }}
        >
          <RankingBars data={data.reportsByCode} height={300} labelWidth={80} />
        </ChartCard>

        <ChartCard
          title="Evolução dos apontamentos"
          description="Acompanha se a orientação individual está surtindo efeito."
          table={{ head: ["Mês", "RAPs"], rows: data.reportsByPeriod.map((row) => [row.label, row.value]) }}
        >
          <TrendLine data={data.reportsByPeriod} />
        </ChartCard>
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.06)]">
        <h3 className="text-[15px] font-semibold text-[#0b0b0b]">Analisar um colaborador</h3>
        <p className="mt-1 text-xs text-[#52514e]">Filtra a view inteira pela pessoa escolhida.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full border px-3 py-1.5 text-xs ${employeeId === null ? "border-[#db0f0f] bg-[#db0f0f] text-white" : "border-black/10 text-[#52514e] hover:bg-neutral-50"}`}
            onClick={() => onSelectEmployee(null)}
          >
            Todos
          </button>
          {data.reportsByEmployee.map((row) => {
            const employee = options?.employees.find((item) => item.name === row.label)
            const id = employee ? Number(employee.id) : null
            const isActive = id !== null && id === employeeId

            return (
              <button
                key={row.label}
                type="button"
                disabled={id === null}
                className={`rounded-full border px-3 py-1.5 text-xs ${isActive ? "border-[#db0f0f] bg-[#db0f0f] text-white" : "border-black/10 text-[#52514e] hover:bg-neutral-50"} disabled:opacity-40`}
                onClick={() => onSelectEmployee(id)}
              >
                {row.label}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
