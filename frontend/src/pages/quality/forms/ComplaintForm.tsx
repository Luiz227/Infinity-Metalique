import { type FormEvent, useState } from "react"
import { createPortal } from "react-dom"
import { LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Scroller } from "@/components/ui/scroller"
import { Combobox } from "@/components/ui/combobox"
import { postJson } from "@/lib/api"
import { todayIso } from "@/pages/quality/format"
import { Field, SelectField, TextArea, TextInput } from "@/pages/quality/forms/FormFields"
import type { ComplaintDetail, QualityOptions } from "@/pages/quality/types"

/**
 * Registro de Satisfação do Cliente (RSC): a reclamação recebida do cliente.
 * É o numerador da taxa de satisfação - sem fotos e sem colaborador vinculado,
 * porque a ocorrência chega de fora da fábrica.
 */
export function ComplaintForm({ csrfToken, options, onClose, onCreated, inline = false, initial }: {
  csrfToken: string
  options: QualityOptions
  onClose: () => void
  onCreated: (code: string, message?: string) => void
  inline?: boolean
  initial?: ComplaintDetail
}) {
  const isEditing = initial !== undefined
  const [complaintDate, setComplaintDate] = useState(() => initial?.complaint_date.slice(0, 10) ?? todayIso())
  const [client, setClient] = useState(initial?.client ?? "")
  const [machineTypeId, setMachineTypeId] = useState(
    initial?.machine_type_id == null ? "" : String(initial.machine_type_id),
  )
  const [model, setModel] = useState(initial?.model ?? "")
  const [problem, setProblem] = useState(initial?.problem ?? "")
  const [localTreatment, setLocalTreatment] = useState(initial?.local_treatment ?? "")
  const [qualityAlert, setQualityAlert] = useState(initial?.quality_alert ?? "")
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const models = options.machineModels.filter(
    (item) => !machineTypeId || String(item.machineTypeId) === machineTypeId,
  )

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setError("")

    try {
      const payload = await postJson<{ message: string; complaint: { code: string } }>(
        `/backend/api/quality/${isEditing ? "complaint-update" : "complaint-create"}.php`,
        {
          ...(initial ? { id: initial.id } : {}),
          csrfToken,
          complaintDate,
          client,
          machineTypeId: Number(machineTypeId),
          model,
          problem,
          localTreatment,
          qualityAlert,
        },
      )
      onCreated(payload.complaint.code, payload.message)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsSaving(false)
    }
  }

  // Embutido não rola - a caixa é do painel. Sobreposto rola, e aí o recuo vai
  // para o conteúdo: assim o respiro de baixo entra na conta da rolagem em vez
  // de virar um pedaço morto no fim.
  const form = (
    <Scroller
      className={inline ? "mt-6 w-full pb-2" : "fixed inset-0 z-50 overflow-auto bg-black/45"}
      contentClassName={inline ? undefined : "grid place-items-start p-4 py-8"}
      enabled={!inline}
      role={inline ? "region" : "dialog"}
      aria-modal={inline ? undefined : true}
      aria-labelledby="complaint-form-title"
    >
      <form className={`mx-auto w-full max-w-3xl bg-white p-6 text-ink ${inline ? "rounded-lg border border-hairline" : "rounded-2xl shadow-2xl"}`} onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="complaint-form-title" className="text-xl font-semibold">
              {isEditing ? `Editar registro ${initial?.code}` : "Registro de satisfação do cliente"}
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              {isEditing ? "As alterações ficarão registradas no histórico." : "O número RSC é gerado na gravação."}
            </p>
          </div>
          <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label="Fechar" disabled={isSaving}><X /></Button>
        </div>

        {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

        <fieldset className="mt-5 grid gap-4 sm:grid-cols-2" disabled={isSaving}>
          <Field label="Data da reclamação" required>
            <TextInput type="date" value={complaintDate} onChange={(event) => setComplaintDate(event.target.value)} required />
          </Field>

          <Field label="Cliente" required>
            <Combobox
              value={client}
              onChange={setClient}
              options={options.clients.map((item) => item.name)}
              placeholder="Nome do cliente"
              searchPlaceholder="Buscar ou digitar um novo"
              emptyLabel="Nenhum cliente encontrado."
              allowCreate
            />
          </Field>

          <Field label="Tipo de máquina" required>
            <SelectField
              ariaLabel="Tipo de máquina"
              value={machineTypeId}
              onValueChange={(valor) => { setMachineTypeId(valor); setModel("") }}
              options={options.machineTypes.map((type) => ({ value: String(type.id), label: type.name }))}
            />
          </Field>

          <Field label="Modelo">
            <Combobox
              value={model}
              onChange={setModel}
              options={models.map((item) => item.name)}
              placeholder="Selecione o modelo"
              searchPlaceholder="Buscar ou digitar um novo"
              emptyLabel="Nenhum modelo para esta máquina."
              allowCreate
              clearable
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Ocorrência relatada pelo cliente" required hint="Mínimo de 10 caracteres.">
              <TextArea value={problem} onChange={(event) => setProblem(event.target.value)} required />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Tratativa local">
              <TextArea value={localTreatment} onChange={(event) => setLocalTreatment(event.target.value)} />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Alerta da qualidade">
              <TextInput value={qualityAlert} onChange={(event) => setQualityAlert(event.target.value)} />
            </Field>
          </div>
        </fieldset>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button type="submit" className="rounded-full" disabled={isSaving}>
            {isSaving && <LoaderCircle className="animate-spin" />}
            {isSaving ? (isEditing ? "Salvando..." : "Gravando...") : (isEditing ? "Salvar alterações" : "Gravar registro")}
          </Button>
        </div>
      </form>
    </Scroller>
  )

  // Em tela cheia o formulário nasce fora do painel: o painel é mascarado
  // (ver `.scroll-fade` em base.css) e máscara recorta descendente
  // `position: fixed`, que é o que sustenta este sobreposto. Embutido, ele é
  // conteúdo comum da página e fica onde está.
  return inline ? form : createPortal(form, document.body)
}
