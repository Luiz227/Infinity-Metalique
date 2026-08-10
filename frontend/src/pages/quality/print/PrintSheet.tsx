import { useEffect } from "react"
import { LoaderCircle, Printer, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatDate } from "@/pages/quality/format"
import type { DispatchDetail, ReportDetail } from "@/pages/quality/types"

/** Par rótulo/valor da folha impressa. */
function Row({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#898781]">{label}</p>
      <p className="mt-0.5 text-sm text-[#0b0b0b]">{value || "—"}</p>
    </div>
  )
}

/**
 * Folha A4 do RAP ou da coleta. A exportação em PDF é a própria caixa de
 * impressão do navegador — sem biblioteca nova, conforme a seção 7 do processo.
 */
export function PrintSheet({ report, dispatch, isLoading, onClose }: {
  report?: ReportDetail | null
  dispatch?: DispatchDetail | null
  isLoading: boolean
  onClose: () => void
}) {
  // Esc fecha, como em qualquer diálogo.
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [onClose])

  return (
    <div className="quality-print-overlay fixed inset-0 z-50 overflow-auto bg-black/45 p-4 py-8" role="dialog" aria-modal="true">
      <div className="mx-auto w-full max-w-[820px]">
        <div className="quality-print-actions mb-3 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            <X /> Fechar
          </Button>
          <Button type="button" className="rounded-full" onClick={() => window.print()} disabled={isLoading}>
            <Printer /> Imprimir / salvar PDF
          </Button>
        </div>

        <article className="quality-print-sheet rounded-2xl bg-white p-8 text-[#0b0b0b] shadow-2xl">
          {isLoading && (
            <div className="grid h-64 place-items-center text-[#898781]">
              <LoaderCircle className="size-6 animate-spin" aria-label="Carregando" />
            </div>
          )}

          {!isLoading && report && (
            <>
              <header className="flex items-start justify-between gap-6 border-b-2 border-[#db0f0f] pb-4">
                <div>
                  <img src="/images/logo.svg" alt="Metalique Infinity" className="h-9 w-auto" />
                  <h1 className="mt-3 text-lg font-semibold">Relatório de Apontamento</h1>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#898781]">Número</p>
                  <p className="text-2xl font-semibold text-[#db0f0f]">{report.code}</p>
                  <p className="mt-1 text-xs text-[#52514e]">{formatDate(report.report_date)}</p>
                </div>
              </header>

              <section className="mt-5 grid grid-cols-2 gap-4">
                <Row label="Identificação" value={report.action_type} />
                <Row label="Cliente / lote" value={report.client} />
                <Row label="Tipo de máquina" value={report.machine_type} />
                <Row label="Modelo" value={report.model} />
                <Row label="Barracão (origem)" value={report.shed} />
                <Row label="Área da ação corretiva" value={report.sector} />
                <Row label="Gate" value={report.gate} />
                <Row label="Local da não conformidade" value={report.problem_type} />
                <Row
                  label="Código do problema"
                  value={report.quality_code ? `${report.quality_code} — ${report.quality_code_description ?? ""}` : null}
                  wide
                />
                <Row label="Descrição do ocorrido" value={report.description} wide />
                <Row label="Ação imediata" value={report.immediate_action} wide />
                <Row label="Colaboradores envolvidos" value={report.employees.join(" · ")} wide />
                <Row
                  label="Abrangência da ação corretiva"
                  value={report.needs_checklist_update ? `Atualizar checklist: ${report.checklist_change ?? ""}` : "Não gera atualização de checklist"}
                  wide
                />
              </section>

              <footer className="mt-8 grid grid-cols-2 gap-8 border-t border-[#e1e0d9] pt-6 text-xs text-[#52514e]">
                <div><div className="h-10 border-b border-[#c3c2b7]" /><p className="mt-1">Inspetor da qualidade</p></div>
                <div><div className="h-10 border-b border-[#c3c2b7]" /><p className="mt-1">Responsável pela área</p></div>
                <p className="col-span-2 text-[10px] text-[#898781]">
                  Registrado por {report.created_by ?? "importação da planilha"} · Metalique Infinity
                </p>
              </footer>
            </>
          )}

          {!isLoading && dispatch && (
            <>
              <header className="flex items-start justify-between gap-6 border-b-2 border-[#db0f0f] pb-4">
                <div>
                  <img src="/images/logo.svg" alt="Metalique Infinity" className="h-9 w-auto" />
                  <h1 className="mt-3 text-lg font-semibold">Relatório de Produto Coletado</h1>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#898781]">Número</p>
                  <p className="text-2xl font-semibold text-[#db0f0f]">{dispatch.code}</p>
                  <p className="mt-1 text-xs text-[#52514e]">{formatDate(dispatch.dispatch_date)}</p>
                </div>
              </header>

              <section className="mt-5 grid grid-cols-2 gap-4">
                <Row label="Cliente" value={dispatch.client} />
                <Row label="Tipo de máquina" value={dispatch.machine_type} />
                <Row label="Modelo" value={dispatch.model} />
                <Row label="Colaboradores" value={dispatch.employees.join(" · ")} />
                <Row label="Ocorrências durante o carregamento" value={dispatch.notes} wide />
                <Row label="Ação imediata" value={dispatch.immediate_action} wide />
                <Row
                  label="Abrangência"
                  value={dispatch.needs_form_update ? `Atualizar formulário: ${dispatch.form_change ?? ""}` : "Não gera alteração de formulário"}
                  wide
                />
              </section>

              {dispatch.photos.length > 0 && (
                <section className="mt-6">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#898781]">Registro fotográfico</p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    {dispatch.photos.map((path) => (
                      <img key={path} src={`/${path}`} alt="Foto do carregamento" className="w-full rounded-lg border border-black/10 object-cover" />
                    ))}
                  </div>
                </section>
              )}

              <footer className="mt-8 grid grid-cols-2 gap-8 border-t border-[#e1e0d9] pt-6 text-xs text-[#52514e]">
                <div><div className="h-10 border-b border-[#c3c2b7]" /><p className="mt-1">Inspetor da qualidade</p></div>
                <div><div className="h-10 border-b border-[#c3c2b7]" /><p className="mt-1">Motorista / transportadora</p></div>
                <p className="col-span-2 text-[10px] text-[#898781]">
                  Registrado por {dispatch.created_by ?? "importação da planilha"} · Metalique Infinity
                </p>
              </footer>
            </>
          )}
        </article>
      </div>
    </div>
  )
}
