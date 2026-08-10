import { Printer } from "lucide-react"

import { formatDate } from "@/pages/quality/format"
import type { Paginated, ReportRow } from "@/pages/quality/types"

/** Consulta e impressão de RAPs individuais, conforme a seção 3.2 do processo. */
export function ReportsSection({ reports, page, onPageChange, onPrint }: {
  reports: Paginated<ReportRow> | null
  page: number
  onPageChange: (page: number) => void
  onPrint: (id: number) => void
}) {
  const lastPage = reports ? Math.max(1, Math.ceil(reports.total / reports.perPage)) : 1

  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-[#0b0b0b]">Apontamentos registrados</h3>
          <p className="mt-1 text-xs text-[#52514e]">
            {reports ? `${reports.total} RAPs no filtro atual.` : "Carregando..."}
          </p>
        </div>

        {reports && reports.total > reports.perPage && (
          <div className="flex items-center gap-2 text-xs text-[#52514e]">
            <button
              type="button"
              className="rounded-full border border-black/10 px-3 py-1 disabled:opacity-40 hover:bg-neutral-50"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              Anterior
            </button>
            <span className="[font-variant-numeric:tabular-nums]">{page} de {lastPage}</span>
            <button
              type="button"
              className="rounded-full border border-black/10 px-3 py-1 disabled:opacity-40 hover:bg-neutral-50"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= lastPage}
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 overflow-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="text-[#52514e]">
              {["Nº", "Data", "Cliente / lote", "Máquina", "Barracão", "Gate", "Código", "Colaboradores", ""].map((head, index) => (
                <th key={index} className="border-b border-[#e1e0d9] pb-2 pr-3 font-medium">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports?.items.length === 0 && (
              <tr><td className="py-3 text-[#898781]" colSpan={9}>Nenhum apontamento no filtro atual.</td></tr>
            )}
            {reports?.items.map((row) => (
              <tr key={row.id} className="border-b border-[#f0efec] last:border-0 align-top">
                <td className="py-2 pr-3 font-medium text-[#0b0b0b] [font-variant-numeric:tabular-nums]">{row.code}</td>
                <td className="py-2 pr-3 text-[#52514e] [font-variant-numeric:tabular-nums]">{formatDate(row.report_date)}</td>
                <td className="py-2 pr-3 text-[#0b0b0b]">{row.client ?? "—"}</td>
                <td className="py-2 pr-3 text-[#52514e]">{row.machine_type ?? "—"}{row.model ? ` · ${row.model}` : ""}</td>
                <td className="py-2 pr-3 text-[#52514e]">{row.shed ?? "—"}</td>
                <td className="py-2 pr-3 text-[#52514e]">{row.gate ?? "—"}</td>
                <td className="py-2 pr-3 text-[#52514e]" title={row.quality_code_description ?? ""}>{row.quality_code ?? "—"}</td>
                <td className="py-2 pr-3 text-[#52514e]">{row.employees ?? "—"}</td>
                <td className="py-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2.5 py-1 text-xs text-[#52514e] hover:bg-neutral-50"
                    onClick={() => onPrint(row.id)}
                  >
                    <Printer className="size-3.5" /> Imprimir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
