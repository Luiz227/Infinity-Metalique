import { useState } from "react"
import { Camera, Printer } from "lucide-react"

import {
  RecordDeleteButton,
  RecordDeleteDialog,
  type DeleteResult,
  type RecordKind,
  type RecordTarget,
} from "@/pages/quality/RecordDeleteDialog"
import { formatDate } from "@/pages/quality/format"
import type { DispatchRow, Paginated, ReportRow } from "@/pages/quality/types"

function Pagination({ records, page, onPageChange }: {
  records: Paginated<unknown> | null
  page: number
  onPageChange: (page: number) => void
}) {
  if (!records || records.total <= records.perPage) return null

  const lastPage = Math.max(1, Math.ceil(records.total / records.perPage))

  return (
    <div className="flex items-center gap-2 text-xs text-[#52514e]">
      <button
        type="button"
        className="rounded-full border border-black/10 px-3 py-1 hover:bg-neutral-50 disabled:opacity-40"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Anterior
      </button>
      <span className="[font-variant-numeric:tabular-nums]">{page} de {lastPage}</span>
      <button
        type="button"
        className="rounded-full border border-black/10 px-3 py-1 hover:bg-neutral-50 disabled:opacity-40"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= lastPage}
      >
        Próxima
      </button>
    </div>
  )
}

/** Consulta, impressão e gestão dos RAPs e RETIR registrados. */
export function ReportsSection({
  reports,
  dispatches,
  reportsPage,
  dispatchesPage,
  canDelete,
  onReportsPageChange,
  onDispatchesPageChange,
  onPrint,
  onPrintDispatch,
  onDelete,
}: {
  reports: Paginated<ReportRow> | null
  dispatches: Paginated<DispatchRow> | null
  reportsPage: number
  dispatchesPage: number
  canDelete: boolean
  onReportsPageChange: (page: number) => void
  onDispatchesPageChange: (page: number) => void
  onPrint: (id: number) => void
  onPrintDispatch: (id: number) => void
  onDelete: (kind: RecordKind, id: number) => Promise<DeleteResult>
}) {
  const [deleteTarget, setDeleteTarget] = useState<RecordTarget | null>(null)

  return (
    <>
      <div className="grid gap-4">
        <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0b0b0b]">RAPs registrados</h3>
            <p className="mt-1 text-xs text-[#52514e]">
              {reports ? `${reports.total} RAPs no filtro atual.` : "Carregando..."}
            </p>
          </div>
          <Pagination records={reports} page={reportsPage} onPageChange={onReportsPageChange} />
        </div>

        <div className="mt-4 overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-[#52514e]">
                {["Nº", "Data", "Cliente / lote", "Máquina", "Barracão", "Gate", "Código", "Colaboradores", "Ações"].map((head) => (
                  <th key={head} className="border-b border-[#e1e0d9] pb-2 pr-3 font-medium">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!reports && (
                <tr><td className="py-3 text-[#898781]" colSpan={9}>Carregando apontamentos...</td></tr>
              )}
              {reports?.items.length === 0 && (
                <tr><td className="py-3 text-[#898781]" colSpan={9}>Nenhum RAP no filtro atual.</td></tr>
              )}
              {reports?.items.map((row) => (
                <tr key={row.id} className="border-b border-[#f0efec] last:border-0 align-top">
                  <td className="py-2 pr-3 font-medium text-[#0b0b0b] [font-variant-numeric:tabular-nums]">{row.code}</td>
                  <td className="py-2 pr-3 text-[#52514e] [font-variant-numeric:tabular-nums]">{formatDate(row.report_date)}</td>
                  <td className="py-2 pr-3 text-[#0b0b0b]">{row.client ?? "-"}</td>
                  <td className="py-2 pr-3 text-[#52514e]">{row.machine_type ?? "-"}{row.model ? ` · ${row.model}` : ""}</td>
                  <td className="py-2 pr-3 text-[#52514e]">{row.shed ?? "-"}</td>
                  <td className="py-2 pr-3 text-[#52514e]">{row.gate ?? "-"}</td>
                  <td className="py-2 pr-3 text-[#52514e]" title={row.quality_code_description ?? ""}>{row.quality_code ?? "-"}</td>
                  <td className="py-2 pr-3 text-[#52514e]">{row.employees ?? "-"}</td>
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
                          target={{ kind: "report", id: row.id, code: row.code }}
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

        <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0b0b0b]">Produtos coletados (RETIR)</h3>
            <p className="mt-1 text-xs text-[#52514e]">
              {dispatches ? `${dispatches.total} RETIR no filtro atual.` : "Carregando..."}
            </p>
          </div>
          <Pagination records={dispatches} page={dispatchesPage} onPageChange={onDispatchesPageChange} />
        </div>

        <div className="mt-4 overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-[#52514e]">
                {["Nº", "Data", "Cliente", "Máquina", "Modelo", "Fotos", "Ações"].map((head) => (
                  <th key={head} className="border-b border-[#e1e0d9] pb-2 pr-3 font-medium">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!dispatches && (
                <tr><td className="py-3 text-[#898781]" colSpan={7}>Carregando produtos coletados...</td></tr>
              )}
              {dispatches?.items.length === 0 && (
                <tr><td className="py-3 text-[#898781]" colSpan={7}>Nenhum RETIR no filtro atual.</td></tr>
              )}
              {dispatches?.items.map((row) => (
                <tr key={row.id} className="border-b border-[#f0efec] last:border-0 align-top">
                  <td className="py-2 pr-3 font-medium text-[#0b0b0b] [font-variant-numeric:tabular-nums]">{row.code}</td>
                  <td className="py-2 pr-3 text-[#52514e] [font-variant-numeric:tabular-nums]">{formatDate(row.dispatch_date)}</td>
                  <td className="py-2 pr-3 text-[#0b0b0b]">{row.client ?? "-"}</td>
                  <td className="py-2 pr-3 text-[#52514e]">{row.machine_type ?? "-"}</td>
                  <td className="py-2 pr-3 text-[#52514e]">{row.model ?? "-"}</td>
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
                        onClick={() => onPrintDispatch(row.id)}
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
