import { type FormEvent, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Scroller } from "@/components/ui/scroller"
import { getJson, postJson } from "@/lib/api"
import { formatDate, todayIso } from "@/pages/quality/format"
import { Field, SelectField, TextArea, TextInput } from "@/pages/quality/forms/FormFields"
import type { ComplaintRow, Paginated, QualityOptions } from "@/pages/quality/types"

/**
 * Abertura do plano de ação (PAC).
 *
 * O plano nasce sobre uma reclamação, então o formulário começa procurando ela:
 * cliente, máquina e modelo recortam a lista, e só aparecem as reclamações que
 * ainda não têm plano - `planStatus=none` é o que garante isso, e é o mesmo
 * endpoint que alimenta a aba Registros.
 */
export function ActionPlanForm({ csrfToken, options, complaint = null, onClose, onCreated }: {
  csrfToken: string
  options: QualityOptions
  /** Vindo do atalho da tabela, a reclamação já chega escolhida. */
  complaint?: ComplaintRow | null
  onClose: () => void
  onCreated: (code: string) => void
}) {
  const [clientId, setClientId] = useState("")
  const [machineTypeId, setMachineTypeId] = useState("")
  const [model, setModel] = useState("")
  const [candidates, setCandidates] = useState<ComplaintRow[] | null>(null)
  const [selected, setSelected] = useState<ComplaintRow | null>(complaint)
  const [openedOn, setOpenedOn] = useState(todayIso)
  const [dueOn, setDueOn] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [rootCause, setRootCause] = useState("")
  const [action, setAction] = useState("")
  const [firstNote, setFirstNote] = useState("")
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const models = options.machineModels.filter(
    (item) => !machineTypeId || String(item.machineTypeId) === machineTypeId,
  )
  const clientName = options.clients.find((item) => String(item.id) === clientId)?.name ?? ""

  // A busca só faz sentido quando algo foi escolhido: sem recorte ela traria o
  // histórico inteiro de reclamações sem plano.
  const hasSearch = clientId !== "" || machineTypeId !== "" || model !== ""

  useEffect(() => {
    if (selected || !hasSearch) {
      setCandidates(null)
      return
    }

    const controller = new AbortController()
    const query = new URLSearchParams({ planStatus: "none", perPage: "25" })
    if (clientId) query.set("clientId", clientId)
    if (machineTypeId) query.set("machineTypeId", machineTypeId)
    if (model) query.set("model", model)

    getJson<Paginated<ComplaintRow>>(`/backend/api/quality/complaints.php?${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((payload) => {
        if (!controller.signal.aborted) setCandidates(payload.items)
      })
      .catch(() => {
        if (!controller.signal.aborted) setCandidates([])
      })

    return () => controller.abort()
  }, [clientId, hasSearch, machineTypeId, model, selected])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) {
      setError("Escolha a reclamação que este plano vai tratar.")
      return
    }

    setIsSaving(true)
    setError("")

    try {
      const payload = await postJson<{ message: string; plan: { code: string } }>(
        "/backend/api/quality/action-plan-create.php",
        {
          csrfToken,
          complaintId: selected.id,
          openedOn,
          dueOn: dueOn || null,
          employeeId: employeeId ? Number(employeeId) : null,
          rootCause,
          action,
          firstNote,
        },
      )
      onCreated(payload.plan.code)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsSaving(false)
    }
  }

  return createPortal(
    <Scroller
      className="fixed inset-0 z-50 overflow-auto bg-black/45"
      contentClassName="grid place-items-start p-4 py-8"
      role="dialog"
      aria-modal
      aria-labelledby="action-plan-form-title"
    >
      <form className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 text-ink shadow-2xl" onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="action-plan-form-title" className="text-xl font-semibold">Abrir plano de ação</h2>
            <p className="mt-1 text-xs text-ink-soft">
              O número PAC é gerado na gravação. O fechamento é lançado depois, quando a ação terminar.
            </p>
          </div>
          <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label="Fechar"><X /></Button>
        </div>

        {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

        <fieldset className="mt-5 grid gap-4" disabled={isSaving}>
          <div className="rounded-lg border border-hairline p-4">
            <h3 className="text-sm font-semibold text-ink">Reclamação a tratar</h3>

            {selected ? (
              <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-lg bg-neutral-50 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {selected.code} · {formatDate(selected.complaint_date)} · {selected.client ?? "-"}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {selected.machine_type ?? "-"}{selected.model ? ` · ${selected.model}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">{selected.problem ?? "-"}</p>
                </div>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setSelected(null)}>
                  Trocar
                </Button>
              </div>
            ) : (
              <>
                <p className="mt-1 text-xs text-ink-soft">
                  Filtre por cliente, máquina e modelo. Só aparecem as reclamações que ainda não têm plano.
                </p>

                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  <Field label="Cliente">
                    <Combobox
                      value={clientName}
                      onChange={(name) => {
                        const found = options.clients.find((item) => item.name === name)
                        setClientId(found ? String(found.id) : "")
                      }}
                      options={options.clients.map((item) => item.name)}
                      placeholder="Todos os clientes"
                      searchPlaceholder="Buscar cliente"
                      emptyLabel="Nenhum cliente encontrado."
                      clearable
                    />
                  </Field>

                  <Field label="Tipo de máquina">
                    <SelectField
                      ariaLabel="Tipo de máquina"
                      placeholder="Todas"
                      value={machineTypeId}
                      onValueChange={(value) => { setMachineTypeId(value); setModel("") }}
                      options={options.machineTypes.map((type) => ({ value: String(type.id), label: type.name }))}
                    />
                  </Field>

                  <Field label="Modelo">
                    <Combobox
                      value={model}
                      onChange={setModel}
                      options={models.map((item) => item.name)}
                      placeholder="Todos"
                      searchPlaceholder="Buscar modelo"
                      emptyLabel="Nenhum modelo para esta máquina."
                      clearable
                    />
                  </Field>
                </div>

                <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-hairline">
                  {!hasSearch && (
                    <p className="p-3 text-xs text-ink-muted">
                      Escolha ao menos um filtro para listar as reclamações.
                    </p>
                  )}
                  {hasSearch && !candidates && (
                    <p className="p-3 text-xs text-ink-muted">Procurando reclamações...</p>
                  )}
                  {hasSearch && candidates?.length === 0 && (
                    <p className="p-3 text-xs text-ink-muted">
                      Nenhuma reclamação sem plano de ação neste recorte.
                    </p>
                  )}
                  {candidates?.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full flex-col gap-0.5 border-b border-[#f0efec] p-3 text-left last:border-0 hover:bg-neutral-50"
                      onClick={() => setSelected(item)}
                    >
                      <span className="text-sm font-medium text-ink">
                        {item.code} · {formatDate(item.complaint_date)} · {item.client ?? "-"}
                      </span>
                      <span className="text-xs text-ink-soft">
                        {item.machine_type ?? "-"}{item.model ? ` · ${item.model}` : ""} — {item.problem ?? "-"}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Data de abertura" required>
              <TextInput type="date" value={openedOn} onChange={(event) => setOpenedOn(event.target.value)} required />
            </Field>

            <Field label="Prazo previsto" hint="Vencido e sem fechamento, o plano conta como atrasado.">
              <TextInput type="date" value={dueOn} min={openedOn} onChange={(event) => setDueOn(event.target.value)} />
            </Field>

            <Field label="Responsável">
              <SelectField
                ariaLabel="Responsável pela ação"
                placeholder="Sem responsável"
                value={employeeId}
                onValueChange={setEmployeeId}
                options={options.employees.map((item) => ({ value: String(item.id), label: item.name }))}
              />
            </Field>
          </div>

          <Field label="Causa raiz">
            <TextArea value={rootCause} onChange={(event) => setRootCause(event.target.value)} />
          </Field>

          <Field label="Ação planejada" required hint="Mínimo de 10 caracteres.">
            <TextArea value={action} onChange={(event) => setAction(event.target.value)} required />
          </Field>

          <Field label="Primeiro andamento" hint="Opcional. Entra no log com a data de abertura.">
            <TextArea value={firstNote} onChange={(event) => setFirstNote(event.target.value)} />
          </Field>
        </fieldset>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" className="rounded-full" disabled={isSaving || !selected}>
            {isSaving && <LoaderCircle className="animate-spin" />}
            {isSaving ? "Abrindo..." : "Abrir plano"}
          </Button>
        </div>
      </form>
    </Scroller>,
    document.body,
  )
}
