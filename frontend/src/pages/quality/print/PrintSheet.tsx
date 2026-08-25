import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { History, LoaderCircle, Pencil, Printer, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Scroller } from "@/components/ui/scroller"
import { PrintHeader } from "@/pages/quality/print/PrintHeader"
import type {
  ActionPlanDetail,
  ComplaintDetail,
  DispatchDetail,
  QualityRecordEdit,
  ReportDetail,
} from "@/pages/quality/types"

const printDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
const editDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })

const EDIT_FIELD_LABELS: Record<string, string> = {
  reportDate: "Data",
  actionType: "Identificação",
  complaintDate: "Data da reclamação",
  dispatchDate: "Data da coleta",
  client: "Cliente / lote",
  machineType: "Tipo de máquina",
  model: "Modelo",
  shed: "Barracão",
  sector: "Área da ação corretiva",
  gate: "Gate",
  problemType: "Local da não conformidade",
  qualityCode: "Código do problema",
  description: "Descrição do ocorrido",
  employees: "Colaboradores",
  needsChecklistUpdate: "Atualização do checklist",
  checklistChange: "Alteração do checklist",
  notes: "Ocorrências no carregamento",
  needsFormUpdate: "Atualização do formulário",
  formChange: "Alteração do formulário",
  immediateAction: "Ação imediata",
  photos: "Fotos",
  problem: "Ocorrência relatada",
  localTreatment: "Tratativa local",
  qualityAlert: "Alerta da qualidade",
}

function historyValue(value: unknown): string {
  if (Array.isArray(value)) return value.length > 0 ? value.map(historyValue).join(" · ") : "—"
  if (typeof value === "boolean") return value ? "Sim" : "Não"
  if (value === null || value === undefined || value === "") return "—"
  return String(value)
}

function historyDate(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : editDate.format(parsed)
}

/** Histórico auditável da tela; fica fora da folha e nunca segue para a impressão. */
function EditHistory({ entries }: { entries: QualityRecordEdit[] }) {
  return (
    <section className="quality-print-actions mb-3 rounded-2xl border border-hairline bg-white p-4 shadow-lg" aria-label="Histórico de edições">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-ink">Histórico de edições</h2>
        <span className="text-xs text-ink-muted">{entries.length} {entries.length === 1 ? "edição" : "edições"}</span>
      </div>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">Este registro ainda não foi editado.</p>
      ) : (
        <ol className="mt-3 grid gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-hairline bg-neutral-50/60 p-3">
              <p className="text-xs text-ink-muted">
                {entry.edited_by ?? "Usuário removido"}
                {entry.edited_by_job_title ? ` · ${entry.edited_by_job_title}` : ""}
                {` · ${historyDate(entry.edited_at)}`}
              </p>
              <dl className="mt-2 grid gap-2">
                {Object.entries(entry.changes).map(([field, change]) => (
                  <div key={field} className="grid gap-0.5 text-sm sm:grid-cols-[180px_1fr] sm:gap-3">
                    <dt className="font-medium text-ink">{EDIT_FIELD_LABELS[field] ?? field}</dt>
                    <dd className="min-w-0 text-ink-soft">
                      <span className="line-through decoration-red-300">{historyValue(change.before)}</span>
                      <span aria-hidden="true"> → </span>
                      <span className="text-ink">{historyValue(change.after)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** 2026-01-05 vira 05/01/2026 sem passar pelo fuso do navegador. */
function sheetDate(value: string | null): string {
  if (!value) return "-"
  const [year, month, day] = value.slice(0, 10).split("-").map(Number)
  if (!year || !month || !day) return value

  return printDate.format(new Date(year, month - 1, day))
}

/**
 * O log da tratativa, na folha. Cada andamento é uma `quality-print-row` para o
 * medidor de páginas contar as mesmas caixas que o navegador não parte no meio.
 */
function EntryLog({ entries }: { entries: { entry_date: string; note: string; created_by: string | null }[] }) {
  if (entries.length === 0) return null

  return (
    <section className="mt-5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#898781]">Andamentos</p>
      <div className="mt-2">
        {entries.map((entry, index) => (
          <div key={index} className="quality-print-row flex gap-3 border-b border-[#e1e0d9] py-1.5 last:border-0">
            <span className="w-[74px] shrink-0 text-[12px] text-[#898781]">{sheetDate(entry.entry_date)}</span>
            <span className="text-[13px] text-[#0b0b0b]">
              {entry.note}
              {entry.created_by ? <span className="text-[#898781]"> — {entry.created_by}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Par rótulo/valor da folha impressa. */
function Row({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={`quality-print-row ${wide ? "col-span-2" : ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#898781]">{label}</p>
      <p className="mt-0.5 text-[14px] text-[#0b0b0b]">{value || "-"}</p>
    </div>
  )
}

/**
 * Bloco de assinaturas. Na tela ele segue o conteúdo; na impressão o CSS o
 * transforma na faixa fixa de 16mm presa ao fim de cada folha.
 */
function SignatureFooter({ secondLabel, createdBy, jobTitle, className = "" }: {
  secondLabel: string
  createdBy: string | null
  jobTitle: string | null
  className?: string
}) {
  return (
    <footer className={`${className} mt-8 grid grid-cols-2 gap-x-8 gap-y-2 border-t border-[#e1e0d9] bg-white pt-6 text-[12px] text-[#52514e]`}>
      <div><div className="h-10 border-b border-[#c3c2b7]" /><p className="mt-1">Inspetor da qualidade</p></div>
      <div><div className="h-10 border-b border-[#c3c2b7]" /><p className="mt-1">{secondLabel}</p></div>
      {/* O cargo só entra quando há usuário vinculado - registros importados da
          planilha não têm um, e o " · " solto ficaria pendurado no fim. */}
      <p className="col-span-2 text-[10px] text-[#898781]">
        Registrado por {createdBy ?? "importação da planilha"}{jobTitle ? ` · ${jobTitle}` : ""}
      </p>
    </footer>
  )
}

/**
 * Esqueleto do documento. É uma tabela de uma coluna só de propósito, e não uma
 * pilha de divs: repetir conteúdo rico em toda folha é coisa que só o `<thead>`
 * faz. `position: fixed` não serve - o Chromium recorta o que uma caixa fixa
 * desenha fora da área de conteúdo, então uma faixa encaixada na margem sai da
 * impressora sem nada dentro.
 *
 * - `<thead>`: o cabeçalho, redesenhado no topo de cada folha.
 * - `<tfoot>` vazio: reserva os 16mm da faixa de assinaturas em cada folha, para
 *   o conteúdo parar antes dela em vez de passar por baixo.
 * - `<tbody>`: o corpo, que é quem quebra entre as folhas.
 */
function PrintDocument({ title, code, date, pages, children }: {
  title: string
  code: string
  date: string | null
  /** Total de folhas, quando o documento passa de uma. */
  pages?: number
  children: React.ReactNode
}) {
  return (
    <table className="quality-print-doc w-full">
      <thead>
        <tr>
          <td className="p-0">
            <PrintHeader eyebrow="Número" code={code} date={date} title={title} pages={pages} />
          </td>
        </tr>
      </thead>
      <tfoot>
        <tr><td className="quality-print-reserve p-0" /></tr>
      </tfoot>
      <tbody>
        <tr><td className="p-0">{children}</td></tr>
      </tbody>
    </table>
  )
}

/** Geometria do papel, em mm. Espelha o `@page` do quality.css. */
const PAPER = { height: 297, marginTop: 12, marginBottom: 12, footer: 16, tolerance: 4 }

/**
 * Descobre em quantas folhas o documento cai e qual a altura do cabeçalho.
 *
 * O navegador não conta as páginas para quem está na página, então a conta é
 * feita num clone fora da tela na largura útil do papel. Serve para três fins:
 * só numerar quando há mais de uma folha, dizer o total na tela (onde a folha
 * é rolagem contínua e não existe `counter(pages)`), e saber quanto a caixa de
 * margem precisa descer para o número cair na linha reservada do cabeçalho.
 */
function useSheetPagination(sheetRef: React.RefObject<HTMLElement | null>, ready: boolean) {
  const [paged, setPaged] = useState<{ headerMm: number; pages: number } | null>(null)

  useEffect(() => {
    setPaged(null)
    if (!ready) return
    const sheet = sheetRef.current
    if (!sheet) return

    let cancelled = false
    const probe = document.createElement("div")
    probe.className = "quality-print-measure"
    probe.innerHTML = sheet.innerHTML
    document.body.appendChild(probe)

    const cleanup = () => probe.remove()

    const run = async () => {
      // Fontes e fotos mudam a altura; as fotos do RETIR são justamente o que
      // faz o documento estourar a folha.
      await document.fonts.ready
      await Promise.all(
        Array.from(probe.querySelectorAll("img")).map((img) =>
          img.complete ? null : new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true })
            img.addEventListener("error", resolve, { once: true })
          }),
        ),
      )
      if (cancelled) return cleanup()

      // mm -> px medido, em vez de assumir 96dpi.
      const ruler = document.createElement("div")
      ruler.style.cssText = "height:100mm"
      probe.appendChild(ruler)
      const pxPerMm = ruler.getBoundingClientRect().height / 100
      ruler.remove()

      const header = probe.querySelector(".quality-print-header")
      const body = probe.querySelector("tbody td")
      if (!header || !body || !pxPerMm) return cleanup()

      const headerMm = header.getBoundingClientRect().height / pxPerMm
      const bodyMm = body.getBoundingClientRect().height / pxPerMm
      const usableMm =
        PAPER.height - PAPER.marginTop - PAPER.marginBottom - PAPER.footer - headerMm

      // A folga faz o erro cair sempre para o lado seguro: um relatório que cabe
      // com sobra - o caso já calibrado - nunca ganha numeração.
      if (bodyMm <= usableMm - PAPER.tolerance) return cleanup()

      // Numerando, o cabeçalho ganha a linha reservada do número: é essa altura
      // que a caixa de margem precisa descer, e é ela que vale para a contagem.
      probe.classList.add("quality-print-numbered")
      const numberedMm = header.getBoundingClientRect().height / pxPerMm
      const perPageMm =
        PAPER.height - PAPER.marginTop - PAPER.marginBottom - PAPER.footer - numberedMm

      // Conta as folhas empacotando as caixas que não podem ser partidas - as
      // mesmas que levam `break-inside: avoid` no CSS. É como o navegador
      // fragmenta, então o total daqui bate com o `counter(pages)` do papel.
      const bodyTop = body.getBoundingClientRect().top
      let pages = 1
      let pageTop = 0
      for (const atom of probe.querySelectorAll(
        ".quality-print-row, .quality-photo-section > p, .quality-photo-item",
      )) {
        const box = atom.getBoundingClientRect()
        const top = (box.top - bodyTop) / pxPerMm
        const bottom = (box.bottom - bodyTop) / pxPerMm
        if (bottom - pageTop > perPageMm) { pages += 1; pageTop = top }
      }

      cleanup()
      if (!cancelled) setPaged({ headerMm: numberedMm, pages })
    }

    void run()
    return () => { cancelled = true; cleanup() }
  }, [sheetRef, ready])

  return paged
}

/**
 * Folha A4 do RAP ou da coleta. A exportação em PDF é a própria caixa de
 * impressão do navegador - sem biblioteca nova, conforme a seção 7 do processo.
 *
 * Todos os tamanhos de texto daqui são px fixos de propósito, e não text-xs /
 * text-sm / text-lg como no resto do projeto: esta folha mede papel, não tela.
 * Os valores foram calibrados para o relatório caber em uma página A4, então
 * ela não acompanha a escala tipográfica de global.css - se aquela subir de
 * novo, o que sai na impressora continua igual. Só os botões de ação escapam
 * disso, porque o @media print os esconde antes de imprimir.
 */
export function PrintSheet({ report, dispatch, complaint, plan, isLoading, canEdit = false, onEdit, onClose }: {
  report?: ReportDetail | null
  dispatch?: DispatchDetail | null
  complaint?: ComplaintDetail | null
  plan?: ActionPlanDetail | null
  isLoading: boolean
  canEdit?: boolean
  onEdit?: () => void
  onClose: () => void
}) {
  const [historyOpen, setHistoryOpen] = useState(false)

  // Esc fecha, como em qualquer diálogo.
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [onClose])

  const sheetRef = useRef<HTMLElement | null>(null)
  const paged = useSheetPagination(sheetRef, !isLoading && Boolean(report || dispatch || complaint || plan))
  const editableRecord = report || dispatch || complaint
  const editHistory = editableRecord?.edit_history ?? []
  const recordKey = editableRecord ? `${report ? "report" : dispatch ? "dispatch" : "complaint"}:${editableRecord.id}` : ""

  useEffect(() => setHistoryOpen(false), [recordKey])

  const signature = report
    ? { secondLabel: "Responsável pela área", createdBy: report.created_by, jobTitle: report.created_by_job_title }
    : dispatch
      ? { secondLabel: "Motorista / transportadora", createdBy: dispatch.created_by, jobTitle: dispatch.created_by_job_title }
      : complaint
        ? { secondLabel: "Responsável pela tratativa", createdBy: complaint.created_by, jobTitle: complaint.created_by_job_title }
        : plan
          ? { secondLabel: "Responsável pela ação", createdBy: plan.created_by, jobTitle: plan.created_by_job_title }
          : null

  // O recuo fica no elemento que rola, e não no conteúdo: é
  // `.quality-print-overlay` que o `@media print` zera na hora de imprimir.
  return createPortal(
    <Scroller className="quality-print-overlay fixed inset-0 z-50 overflow-auto bg-black/45 p-4 py-8" role="dialog" aria-modal="true">
      {/* Fora do article: a faixa fixa de 16mm ocupa a reserva do `<tfoot>` no
          fim de cada folha, então fotos, grids e quebras do conteúdo não a
          deslocam - e ela não empurra o relatório para uma folha extra. */}
      {!isLoading && signature && (
        <SignatureFooter
          className="quality-print-signatures"
          secondLabel={signature.secondLabel}
          createdBy={signature.createdBy}
          jobTitle={signature.jobTitle}
        />
      )}

      {/* Só documentos de duas folhas ou mais são numerados, e o `@page` é o
          único lugar de onde sai um texto que muda a cada folha. A margem
          negativa desce a caixa da faixa de margem para dentro do cabeçalho,
          na linha vazia reservada por `.quality-print-page-slot`; a altura vem
          medida porque depende do que o cabeçalho ocupa de verdade. */}
      {paged && (
        <style>{`@page {
  @top-right {
    content: "Página " counter(page) " de " counter(pages);
    font-family: inherit;
    font-size: 9pt;
    color: #db0f0f;
    vertical-align: bottom;
    margin-bottom: -${paged.headerMm.toFixed(1)}mm;
    padding-bottom: 1mm;
  }
}`}</style>
      )}

      <div className="mx-auto w-full max-w-[820px]">
        <div className="quality-print-actions mb-3 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            <X /> Fechar
          </Button>
          {editableRecord && (
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setHistoryOpen((current) => !current)}
              aria-expanded={historyOpen}
            >
              <History /> Histórico{editHistory.length > 0 ? ` (${editHistory.length})` : ""}
            </Button>
          )}
          {canEdit && editableRecord && onEdit && (
            <Button type="button" variant="outline" className="rounded-full" onClick={onEdit}>
              <Pencil /> Editar
            </Button>
          )}
          <Button type="button" className="rounded-full" onClick={() => window.print()} disabled={isLoading}>
            <Printer /> Imprimir / salvar PDF
          </Button>
        </div>

        {historyOpen && editableRecord && <EditHistory entries={editHistory} />}

        <article
          ref={sheetRef}
          className={`quality-print-sheet rounded-2xl bg-white p-8 text-[#0b0b0b] shadow-2xl ${paged ? "quality-print-numbered" : ""}`}
        >
          {isLoading && (
            <div className="grid h-64 place-items-center text-[#898781]">
              <LoaderCircle className="size-6 animate-spin" aria-label="Carregando" />
            </div>
          )}

          {!isLoading && report && (
            <PrintDocument title="Relatório de Apontamento" code={report.code} date={report.report_date} pages={paged?.pages}>
              <section className="quality-print-details mt-5 grid grid-cols-2 gap-4">
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
                  value={report.quality_code ? `${report.quality_code} - ${report.quality_code_description ?? ""}` : null}
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

              <SignatureFooter
                className="quality-screen-signatures"
                secondLabel="Responsável pela área"
                createdBy={report.created_by}
                jobTitle={report.created_by_job_title}
              />
            </PrintDocument>
          )}

          {!isLoading && dispatch && (
            <PrintDocument title="Relatório de Produto Coletado" code={dispatch.code} date={dispatch.dispatch_date} pages={paged?.pages}>
              <section className="quality-print-details mt-5 grid grid-cols-2 gap-4">
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
                <section className="quality-photo-section mt-6">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#898781]">Registro fotográfico</p>
                  <div className="quality-photo-grid mt-2 grid grid-cols-2 gap-3">
                    {dispatch.photos.map((path) => (
                      <figure key={path} className="quality-photo-item aspect-[4/3] overflow-hidden rounded-lg border border-black/10">
                        <img src={`/${path}`} alt="Foto do carregamento" className="size-full object-cover" />
                      </figure>
                    ))}
                  </div>
                </section>
              )}

              <SignatureFooter
                className="quality-screen-signatures"
                secondLabel="Motorista / transportadora"
                createdBy={dispatch.created_by}
                jobTitle={dispatch.created_by_job_title}
              />
            </PrintDocument>
          )}

          {!isLoading && complaint && (
            <PrintDocument title="Registro de Satisfação do Cliente" code={complaint.code} date={complaint.complaint_date} pages={paged?.pages}>
              <section className="quality-print-details mt-5 grid grid-cols-2 gap-4">
                <Row label="Cliente" value={complaint.client} />
                <Row label="Tipo de máquina" value={complaint.machine_type} />
                <Row label="Modelo" value={complaint.model} />
                <Row label="Ocorrência relatada pelo cliente" value={complaint.problem} wide />
                <Row label="Tratativa local" value={complaint.local_treatment} wide />
                <Row label="Alerta da qualidade" value={complaint.quality_alert} wide />
              </section>

              {/* O plano de ação vai na mesma folha: a reclamação e a tratativa
                  dela são um documento só para quem audita o setor. */}
              {complaint.plan_code && (
                <>
                  <section className="quality-print-details mt-6 grid grid-cols-2 gap-4">
                    <Row label="Plano de ação" value={complaint.plan_code} />
                    <Row label="Responsável pela ação" value={complaint.plan_employee} />
                    <Row label="Abertura do plano" value={sheetDate(complaint.plan_opened_on)} />
                    <Row label="Prazo previsto" value={sheetDate(complaint.plan_due_on)} />
                    <Row
                      label="Fechamento"
                      value={complaint.plan_closed_on ? sheetDate(complaint.plan_closed_on) : "Em aberto"}
                    />
                    <Row label="Causa raiz" value={complaint.plan_root_cause} />
                    <Row label="Ação planejada" value={complaint.plan_action} wide />
                  </section>

                  <EntryLog entries={complaint.plan_entries} />
                </>
              )}

              <SignatureFooter
                className="quality-screen-signatures"
                secondLabel="Responsável pela tratativa"
                createdBy={complaint.created_by}
                jobTitle={complaint.created_by_job_title}
              />
            </PrintDocument>
          )}

          {!isLoading && plan && (
            <PrintDocument title="Plano de Ação" code={plan.code} date={plan.opened_on} pages={paged?.pages}>
              <section className="quality-print-details mt-5 grid grid-cols-2 gap-4">
                <Row label="Reclamação de origem" value={plan.complaint_code} />
                <Row label="Data da reclamação" value={sheetDate(plan.complaint_date)} />
                <Row label="Cliente" value={plan.client} />
                <Row label="Tipo de máquina" value={plan.machine_type} />
                <Row label="Modelo" value={plan.model} />
                <Row label="Responsável pela ação" value={plan.employee} />
                <Row label="Abertura" value={sheetDate(plan.opened_on)} />
                <Row label="Prazo previsto" value={sheetDate(plan.due_on)} />
                <Row
                  label="Fechamento"
                  value={plan.closed_on ? `${sheetDate(plan.closed_on)}${plan.closed_by ? ` · ${plan.closed_by}` : ""}` : "Em aberto"}
                  wide
                />
                <Row label="Ocorrência relatada pelo cliente" value={plan.problem} wide />
                <Row label="Causa raiz" value={plan.root_cause} wide />
                <Row label="Ação planejada" value={plan.action} wide />
              </section>

              <EntryLog entries={plan.entries} />

              <SignatureFooter
                className="quality-screen-signatures"
                secondLabel="Responsável pela ação"
                createdBy={plan.created_by}
                jobTitle={plan.created_by_job_title}
              />
            </PrintDocument>
          )}
        </article>
      </div>
    </Scroller>,
    document.body,
  )
}
