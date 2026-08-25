import { type FormEvent, useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { CheckCircle2, LoaderCircle, Printer, RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Scroller } from "@/components/ui/scroller"
import { getJson, postJson } from "@/lib/api"
import { formatDate, todayIso } from "@/pages/quality/format"
import { Field, TextArea, TextInput } from "@/pages/quality/forms/FormFields"
import { planStatus, type ActionPlanDetail } from "@/pages/quality/types"

const STATUS_TONE = {
  closed: "border-green-200 bg-green-50 text-green-800",
  late: "border-red-200 bg-red-50 text-red-700",
  open: "border-hairline bg-white text-ink-soft",
} as const

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value || "-"}</p>
    </div>
  )
}

/**
 * O plano de ação aberto: a reclamação de origem, o que foi planejado, e o log
 * dos andamentos até o fechamento.
 *
 * O log é o coração da tela. A abertura, o encerramento e a reabertura entram
 * nele como linhas próprias, então a linha do tempo conta a história inteira
 * sem depender de outra fonte.
 */
export function ActionPlanDialog({ planId, csrfToken, canWrite, onClose, onChanged, onPrint }: {
  planId: number
  csrfToken: string
  canWrite: boolean
  onClose: () => void
  /** Avisa a página para recarregar listas e indicadores. */
  onChanged: (message: string) => void
  onPrint: (id: number) => void
}) {
  const [plan, setPlan] = useState<ActionPlanDetail | null>(null)
  const [error, setError] = useState("")
  const [entryDate, setEntryDate] = useState(todayIso)
  const [note, setNote] = useState("")
  const [closedOn, setClosedOn] = useState(todayIso)
  const [closeNote, setCloseNote] = useState("")
  const [isClosing, setIsClosing] = useState(false)
  const [busy, setBusy] = useState<"entry" | "close" | "reopen" | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const payload = await getJson<{ plan: ActionPlanDetail }>(
        `/backend/api/quality/action-plan.php?id=${planId}`,
        { signal, cache: "no-store" },
      )
      if (!signal?.aborted) setPlan(payload.plan)
    } catch (requestError) {
      if (signal?.aborted) return
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    }
  }, [planId])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && busy === null) onClose() }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [busy, onClose])

  const send = async (action: "entry" | "close" | "reopen", body: Record<string, unknown>) => {
    setBusy(action)
    setError("")

    try {
      const endpoint = action === "entry" ? "action-plan-entry" : "action-plan-close"
      const payload = await postJson<{ message: string; plan: ActionPlanDetail }>(
        `/backend/api/quality/${endpoint}.php`,
        { csrfToken, id: planId, ...body },
      )
      setPlan(payload.plan)
      setNote("")
      setCloseNote("")
      setIsClosing(false)
      onChanged(payload.message)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setBusy(null)
    }
  }

  const submitEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void send("entry", { entryDate, note })
  }

  const submitClose = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void send("close", { closedOn, note: closeNote })
  }

  const status = plan ? planStatus(plan.due_on, plan.closed_on) : null

  return createPortal(
    <Scroller
      className="fixed inset-0 z-50 overflow-auto bg-black/45"
      contentClassName="grid place-items-start p-4 py-8"
      role="dialog"
      aria-modal
      aria-labelledby="action-plan-title"
    >
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 text-ink shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="action-plan-title" className="text-xl font-semibold">
                {plan?.code ?? "Plano de ação"}
              </h2>
              {status && (
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[status.id]}`}>
                  {status.label}
                </span>
              )}
            </div>
            {plan && (
              <p className="mt-1 text-xs text-ink-soft">
                Tratativa de {plan.complaint_code ?? "-"} · {plan.client ?? "-"} ·{" "}
                {plan.machine_type ?? "-"}{plan.model ? ` · ${plan.model}` : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {plan && (
              <Button variant="ghost" size="icon" type="button" onClick={() => onPrint(plan.id)} aria-label="Imprimir plano">
                <Printer />
              </Button>
            )}
            <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label="Fechar"><X /></Button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

        {!plan && !error && (
          <div className="grid h-40 place-items-center text-ink-muted">
            <LoaderCircle className="size-6 animate-spin" aria-label="Carregando plano" />
          </div>
        )}

        {plan && (
          <>
            <section className="mt-5 grid gap-4 rounded-lg border border-hairline p-4 sm:grid-cols-3">
              <Row label="Abertura" value={formatDate(plan.opened_on)} />
              <Row label="Prazo previsto" value={formatDate(plan.due_on)} />
              <Row label="Fechamento" value={formatDate(plan.closed_on)} />
              <Row label="Responsável" value={plan.employee} />
              <div className="sm:col-span-2">
                <Row label="Ocorrência relatada" value={plan.problem} />
              </div>
              <div className="sm:col-span-3">
                <Row label="Causa raiz" value={plan.root_cause} />
              </div>
              <div className="sm:col-span-3">
                <Row label="Ação planejada" value={plan.action} />
              </div>
            </section>

            <section className="mt-5">
              <h3 className="text-[15px] font-semibold text-ink">Andamentos</h3>
              <ol className="mt-3">
                {plan.entries.map((entry) => (
                  <li key={entry.id} className="flex gap-3 border-b border-[#f0efec] py-2.5 last:border-0">
                    <span className="w-[86px] shrink-0 pt-0.5 text-xs text-ink-muted [font-variant-numeric:tabular-nums]">
                      {formatDate(entry.entry_date)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{entry.note}</p>
                      {entry.created_by && (
                        <p className="mt-0.5 text-xs text-ink-muted">{entry.created_by}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              {canWrite && (
                <form className="mt-4 grid gap-3 rounded-lg border border-hairline p-4" onSubmit={submitEntry}>
                  <fieldset className="grid gap-3 sm:grid-cols-[160px_1fr]" disabled={busy !== null}>
                    <Field label="Data do andamento" required>
                      <TextInput
                        type="date"
                        value={entryDate}
                        onChange={(event) => setEntryDate(event.target.value)}
                        required
                      />
                    </Field>
                    <Field label="O que aconteceu" required>
                      <TextArea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className="min-h-[64px]"
                        required
                      />
                    </Field>
                  </fieldset>
                  <div className="flex justify-end">
                    <Button type="submit" variant="outline" className="rounded-full" disabled={busy !== null}>
                      {busy === "entry" && <LoaderCircle className="animate-spin" />}
                      {busy === "entry" ? "Gravando..." : "Registrar andamento"}
                    </Button>
                  </div>
                </form>
              )}
            </section>

            {canWrite && (
              <div className="mt-5 border-t border-hairline pt-5">
                {plan.closed_on ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-ink-soft">
                      Encerrado em {formatDate(plan.closed_on)}
                      {plan.closed_by ? ` por ${plan.closed_by}` : ""}.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      disabled={busy !== null}
                      onClick={() => void send("reopen", { reopen: true })}
                    >
                      {busy === "reopen" ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
                      Reabrir plano
                    </Button>
                  </div>
                ) : isClosing ? (
                  <form className="grid gap-3" onSubmit={submitClose}>
                    <fieldset className="grid gap-3 sm:grid-cols-[160px_1fr]" disabled={busy !== null}>
                      <Field label="Data de conclusão" required>
                        <TextInput
                          type="date"
                          value={closedOn}
                          min={plan.opened_on.slice(0, 10)}
                          onChange={(event) => setClosedOn(event.target.value)}
                          required
                        />
                      </Field>
                      <Field label="Como foi resolvido" hint="Opcional. Entra no log junto com o encerramento.">
                        <TextArea
                          value={closeNote}
                          onChange={(event) => setCloseNote(event.target.value)}
                          className="min-h-[64px]"
                        />
                      </Field>
                    </fieldset>
                    <div className="flex justify-end gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        disabled={busy !== null}
                        onClick={() => setIsClosing(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" className="rounded-full" disabled={busy !== null}>
                        {busy === "close" ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
                        Encerrar plano
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-ink-soft">
                      A data de conclusão é digitada: a ação raramente termina no dia em que é registrada.
                    </p>
                    <Button type="button" className="rounded-full" onClick={() => setIsClosing(true)}>
                      <CheckCircle2 /> Encerrar plano
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Scroller>,
    document.body,
  )
}
