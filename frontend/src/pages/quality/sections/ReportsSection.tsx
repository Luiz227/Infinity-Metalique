import { useEffect, useState } from "react"
import { Camera } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  RecordDeleteDialog,
  type DeleteResult,
  type RecordKind,
  type RecordTarget,
} from "@/pages/quality/RecordDeleteDialog"
import { formatDate } from "@/pages/quality/format"
import { PlanBadge } from "@/pages/quality/PlanBadge"
import {
  Free,
  Pagination,
  PerPage,
  RecordTable,
} from "@/pages/quality/sections/RecordTable"
import type { ComplaintRow, DispatchRow, Paginated, ReportRow } from "@/pages/quality/types"
import type { PermissionKey } from "@/types"

export { PER_PAGE_OPTIONS } from "@/pages/quality/sections/RecordTable"

/**
 * Consulta, impressão e gestão dos registros da qualidade: RAP, RETIR e
 * satisfação do cliente.
 *
 * Os três não cabem empilhados numa tela só, e ninguém compara um com o outro -
 * quem chega aqui já sabe qual procura. Por isso um cartão só, com o tipo
 * escolhido no lugar onde antes ficava o título de cada seção.
 */
export function ReportsSection({
  reports,
  dispatches,
  complaints,
  reportsPage,
  dispatchesPage,
  complaintsPage,
  perPage,
  canDelete,
  permissions,
  kind,
  onReportsPageChange,
  onDispatchesPageChange,
  onComplaintsPageChange,
  onKindChange,
  onPerPageChange,
  onPrint,
  onPrintDispatch,
  onPrintComplaint,
  onOpenPlan,
  onDelete,
}: {
  reports: Paginated<ReportRow> | null
  dispatches: Paginated<DispatchRow> | null
  complaints: Paginated<ComplaintRow> | null
  reportsPage: number
  dispatchesPage: number
  complaintsPage: number
  perPage: number
  canDelete: boolean
  permissions: PermissionKey[]
  kind: RecordKind
  onReportsPageChange: (page: number) => void
  onDispatchesPageChange: (page: number) => void
  onComplaintsPageChange: (page: number) => void
  onKindChange: (kind: RecordKind) => void
  onPerPageChange: (perPage: number) => void
  onPrint: (id: number) => void
  onPrintDispatch: (id: number) => void
  onPrintComplaint: (id: number) => void
  /** Abre o plano da reclamação, ou o formulário de abertura quando não há um. */
  onOpenPlan: ((row: ComplaintRow) => void) | null
  onDelete: (kind: RecordKind, id: number) => Promise<DeleteResult>
}) {
  const [deleteTarget, setDeleteTarget] = useState<RecordTarget | null>(null)

  // A satisfação segue a mesma permissão da aba homônima: quem não enxerga a
  // aba também não a encontra por aqui.
  const canSeeSatisfaction = permissions.includes("quality.satisfaction")
  const views = [
    { id: "report" as const, label: "RAPs", counter: "RAPs" },
    { id: "dispatch" as const, label: "Produtos coletados", counter: "RETIR" },
    ...(canSeeSatisfaction
      ? [{ id: "complaint" as const, label: "Satisfações", counter: "registros de satisfação" }]
      : []),
  ]

  useEffect(() => {
    if (kind === "complaint" && !canSeeSatisfaction) onKindChange("report")
  }, [canSeeSatisfaction, kind, onKindChange])

  const current = views.find((view) => view.id === kind) ?? views[0]
  const records = kind === "report" ? reports : kind === "dispatch" ? dispatches : complaints
  const page = kind === "report" ? reportsPage : kind === "dispatch" ? dispatchesPage : complaintsPage
  const changePage = kind === "report"
    ? onReportsPageChange
    : kind === "dispatch" ? onDispatchesPageChange : onComplaintsPageChange

  return (
    <>
      <section className="rounded-card border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Select value={kind} onValueChange={(value) => onKindChange(value as RecordKind)}>
              <SelectTrigger aria-label="Tipo de registro" className="h-9 w-auto text-[15px] font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {views.map((view) => (
                  <SelectItem key={view.id} value={view.id}>{view.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-ink-soft">
              {records ? `${records.total} ${current.counter} no filtro atual.` : "Carregando..."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PerPage records={records} perPage={perPage} onPerPageChange={onPerPageChange} />
            <Pagination records={records} page={page} onPageChange={changePage} />
          </div>
        </div>

        {kind === "report" && (
          <RecordTable
            kind="report"
            head={["Nº", "Data", "Cliente / lote", "Máquina", "Barracão", "Gate", "Código", "Colaboradores"]}
            records={reports}
            empty="Nenhum RAP no filtro atual."
            canDelete={canDelete}
            onView={onPrint}
            onSelectDelete={setDeleteTarget}
            cells={(row) => [
              row.code,
              formatDate(row.report_date),
              <span className="text-ink">{row.client ?? "-"}</span>,
              `${row.machine_type ?? "-"}${row.model ? ` · ${row.model}` : ""}`,
              row.shed ?? "-",
              row.gate ?? "-",
              <span title={row.quality_code_description ?? undefined}>{row.quality_code ?? "-"}</span>,
              <Free value={row.employees} />,
            ]}
          />
        )}

        {kind === "dispatch" && (
          <RecordTable
            kind="dispatch"
            head={["Nº", "Data", "Cliente", "Máquina", "Modelo", "Fotos"]}
            records={dispatches}
            empty="Nenhum RETIR no filtro atual."
            canDelete={canDelete}
            onView={onPrintDispatch}
            onSelectDelete={setDeleteTarget}
            cells={(row) => [
              row.code,
              formatDate(row.dispatch_date),
              <span className="text-ink">{row.client ?? "-"}</span>,
              row.machine_type ?? "-",
              row.model ?? "-",
              <span className="inline-flex items-center gap-1">
                <Camera className="size-3.5" aria-hidden="true" />
                {row.photos}
              </span>,
            ]}
          />
        )}

        {kind === "complaint" && (
          <RecordTable
            kind="complaint"
            head={["Nº", "Data", "Cliente", "Máquina", "Modelo", "Ocorrência", "Plano de ação"]}
            records={complaints}
            empty="Nenhum registro de satisfação no filtro atual."
            canDelete={canDelete}
            onView={onPrintComplaint}
            onSelectDelete={setDeleteTarget}
            cells={(row) => [
              row.code ?? "-",
              formatDate(row.complaint_date),
              <span className="text-ink">{row.client ?? "-"}</span>,
              row.machine_type ?? "-",
              row.model ?? "-",
              <Free value={row.problem} />,
              <PlanBadge complaint={row} onOpen={onOpenPlan} />,
            ]}
          />
        )}
      </section>

      <RecordDeleteDialog target={deleteTarget} onOpenChange={setDeleteTarget} onDelete={onDelete} />
    </>
  )
}
