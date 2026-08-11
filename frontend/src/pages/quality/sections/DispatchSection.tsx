import { useState } from "react"
import { Camera, Printer } from "lucide-react"

import { ChartCard } from "@/pages/quality/charts/ChartCard"
import { RankingBars, TrendColumns } from "@/pages/quality/charts/QualityCharts"
import { StatTile } from "@/pages/quality/charts/StatTile"
import {
  RecordDeleteButton,
  RecordDeleteDialog,
  type DeleteResult,
  type RecordKind,
  type RecordTarget,
} from "@/pages/quality/RecordDeleteDialog"
import { formatDate } from "@/pages/quality/format"
import type { DispatchRow, Paginated, QualityChartSelection, QualityDashboard, QualityOptions } from "@/pages/quality/types"

/** Expedição: volume de máquinas coletadas e qual produto puxa a saída. */
export function DispatchSection({
  data,
  highlight,
  selection,
  dispatches,
  options,
  canDelete,
  onPrint,
  onDelete,
  onSelectPeriod,
  onSelectMachineType,
  onSelectModel,
}: {
  data: QualityDashboard
  highlight: QualityDashboard | null
  selection: QualityChartSelection | null
  dispatches: Paginated<DispatchRow> | null
  options: QualityOptions | null
  canDelete: boolean
  onPrint: (id: number) => void
  onDelete: (kind: RecordKind, id: number) => Promise<DeleteResult>
  onSelectPeriod: (period: string) => void
  onSelectMachineType: (machineType: string) => void
  onSelectModel: (model: string) => void
}) {
  const selectedPeriod = selection?.filters.year && selection.filters.month
    ? `${selection.filters.year}-${String(selection.filters.month).padStart(2, "0")}`
    : null
  const selectedMachine = options?.machineTypes.find((item) => Number(item.id) === selection?.filters.machineTypeId)?.name ?? null
  const [deleteTarget, setDeleteTarget] = useState<RecordTarget | null>(null)

  return (
    <>
      <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total de coletas" value={data.cards.totalDispatches} hero hint="Relatórios de produto coletado" />
        <StatTile label="Máquina destaque" value={data.cards.highlightMachine ?? "—"} hint="Linha mais expedida no período" />
        <StatTile label="Modelo destaque" value={data.cards.highlightModel ?? "—"} hint="Carro-chefe do período" />
        <StatTile label="Reclamações" value={data.cards.totalComplaints} hint="Ligadas à expedição" />
      </div>

      <ChartCard
        title="Coletas por mês"
        description="Volume de máquinas expedidas — base para decidir produção e importação."
        help="Cada coluna conta as máquinas que saíram no mês. É o denominador da taxa de satisfação na aba Qualidade: reclamação só significa alguma coisa comparada ao volume expedido no mesmo período. Clique numa coluna para recortar os demais gráficos por aquele mês."
        table={{ head: ["Mês", "Coletas"], rows: data.dispatchesByPeriod.map((row) => [row.label, row.value]) }}
      >
        <TrendColumns
          data={data.dispatchesByPeriod}
          measure="coletas"
          highlightData={selection && highlight ? highlight.dispatchesByPeriod : null}
          selectedPeriod={selectedPeriod}
          onSelect={onSelectPeriod}
        />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Coletas por tipo de máquina"
          description="Qual linha de produto mais sai."
          help="Volume expedido por linha de produto. Cruze com “RAPs por tipo de máquina” na aba Produtos: a linha que mais sai naturalmente gera mais apontamento — o que pede ação é a que gera muito RAP e sai pouco."
          table={{ head: ["Máquina", "Coletas"], rows: data.dispatchesByMachineType.map((row) => [row.label, row.value]) }}
        >
          <RankingBars
            data={data.dispatchesByMachineType}
            measure="coletas"
            highlightData={selection && highlight ? highlight.dispatchesByMachineType : null}
            height={320}
            labelWidth={130}
            selectedLabel={selectedMachine}
            onSelect={onSelectMachineType}
          />
        </ChartCard>

        <ChartCard
          title="Coletas por modelo"
          description="Os 15 modelos mais expedidos no período filtrado."
          help="Só os 15 primeiros colocados entram, para o eixo continuar legível. Serve de base de comparação para o ranking de RAPs por modelo: mesma ordem nos dois gráficos quer dizer que o apontamento acompanha o volume, e não o modelo."
          table={{ head: ["Modelo", "Coletas"], rows: data.dispatchesByModel.map((row) => [row.label, row.value]) }}
        >
          <RankingBars
            data={data.dispatchesByModel}
            measure="coletas"
            highlightData={selection && highlight ? highlight.dispatchesByModel : null}
            height={320}
            labelWidth={170}
            selectedLabel={(selection?.filters.model as string | undefined) ?? null}
            onSelect={onSelectModel}
          />
        </ChartCard>
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.06)]">
        <h3 className="text-[15px] font-semibold text-[#0b0b0b]">Últimas coletas</h3>
        <p className="mt-1 text-xs text-[#52514e]">
          {dispatches ? `${dispatches.total} registros no filtro atual.` : "Carregando..."}
        </p>

        <div className="mt-4 max-h-[420px] overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-[#52514e]">
                {["Nº", "Data", "Cliente", "Máquina", "Modelo", "Fotos", "Ações"].map((head) => (
                  <th key={head} className="border-b border-[#e1e0d9] pb-2 pr-3 font-medium">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dispatches?.items.map((row) => (
                <tr key={row.id} className="border-b border-[#f0efec] last:border-0">
                  <td className="py-2 pr-3 font-medium text-[#0b0b0b] [font-variant-numeric:tabular-nums]">{row.code}</td>
                  <td className="py-2 pr-3 text-[#52514e] [font-variant-numeric:tabular-nums]">{formatDate(row.dispatch_date)}</td>
                  <td className="py-2 pr-3 text-[#0b0b0b]">{row.client ?? "—"}</td>
                  <td className="py-2 pr-3 text-[#52514e]">{row.machine_type ?? "—"}</td>
                  <td className="py-2 pr-3 text-[#52514e]">{row.model ?? "—"}</td>
                  <td className="py-2 pr-3 text-[#52514e]">
                    <span className="inline-flex items-center gap-1">
                      <Camera className="size-3.5" aria-hidden="true" />
                      {row.photos}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2.5 py-1 text-xs text-[#52514e] hover:bg-neutral-50"
                        onClick={() => onPrint(row.id)}
                      >
                        <Printer className="size-3.5" /> Imprimir
                      </button>
                      {canDelete && (
                        <RecordDeleteButton
                          target={{ kind: "dispatch", id: row.id, code: row.code }}
                          onSelect={setDeleteTarget}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </section>
      </div>

      <RecordDeleteDialog target={deleteTarget} onOpenChange={setDeleteTarget} onDelete={onDelete} />
    </>
  )
}
