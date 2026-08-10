import { type ChangeEvent, type FormEvent, useEffect, useState } from "react"
import { LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { readJson } from "@/lib/api"
import { EmployeePicker, Field, SelectField, TextArea, TextInput } from "@/pages/quality/forms/FormFields"
import type { QualityOptions } from "@/pages/quality/types"

const today = () => new Date().toISOString().slice(0, 10)

/** Relatório de Produto Coletado (seção 5.2): exige no mínimo duas fotos do carregamento. */
export function DispatchForm({ csrfToken, options, onClose, onCreated }: {
  csrfToken: string
  options: QualityOptions
  onClose: () => void
  onCreated: (code: string) => void
}) {
  const [dispatchDate, setDispatchDate] = useState(today)
  const [client, setClient] = useState("")
  const [machineTypeId, setMachineTypeId] = useState("")
  const [model, setModel] = useState("")
  const [notes, setNotes] = useState("")
  const [employeeIds, setEmployeeIds] = useState<(number | null)[]>([null, null, null])
  const [needsFormUpdate, setNeedsFormUpdate] = useState(false)
  const [formChange, setFormChange] = useState("")
  const [immediateAction, setImmediateAction] = useState("")
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const models = options.machineModels.filter(
    (item) => !machineTypeId || String(item.machineTypeId) === machineTypeId,
  )

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const selectPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 6)
    previews.forEach((url) => URL.revokeObjectURL(url))
    setPhotos(files)
    setPreviews(files.map((file) => URL.createObjectURL(file)))
    setError("")
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    // A regra das duas fotos é conferida aqui e de novo no servidor.
    if (photos.length < 2) {
      setError("Envie pelo menos duas fotos do carregamento.")
      return
    }

    setIsSaving(true)
    setError("")

    const body = new FormData()
    body.append("csrfToken", csrfToken)
    body.append("dispatchDate", dispatchDate)
    body.append("client", client)
    body.append("machineTypeId", machineTypeId)
    body.append("model", model)
    body.append("notes", notes)
    body.append("needsFormUpdate", needsFormUpdate ? "1" : "0")
    body.append("formChange", formChange)
    body.append("immediateAction", immediateAction)
    for (const id of employeeIds) {
      if (id !== null) body.append("employeeIds[]", String(id))
    }
    for (const photo of photos) body.append("photos[]", photo)

    try {
      const response = await fetch("/backend/api/quality/dispatch-create.php", {
        method: "POST",
        credentials: "include",
        body,
      })
      const payload = await readJson<{ message: string; dispatch: { code: string } }>(response)
      onCreated(payload.dispatch.code)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-auto bg-black/45 p-4 py-8" role="dialog" aria-modal="true" aria-labelledby="dispatch-form-title">
      <form className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 text-[#0b0b0b] shadow-2xl" onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="dispatch-form-title" className="text-xl font-semibold">Novo produto coletado</h2>
            <p className="mt-1 text-xs text-[#52514e]">O número da coleta é gerado na gravação.</p>
          </div>
          <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label="Fechar"><X /></Button>
        </div>

        {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

        <fieldset className="mt-5 grid gap-4 sm:grid-cols-2" disabled={isSaving}>
          <Field label="Data da coleta" required>
            <TextInput type="date" value={dispatchDate} onChange={(event) => setDispatchDate(event.target.value)} required />
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
            <Field label="Ocorrências durante o carregamento">
              <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Colaborador responsável pelo carregamento" required hint="Até três.">
              <EmployeePicker employees={options.employees} value={employeeIds} onChange={setEmployeeIds} />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Fotos do carregamento" required hint="Mínimo de duas, máximo de seis. JPG, PNG ou WebP de até 5 MB cada.">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={selectPhotos}
                className="text-sm text-[#52514e] file:mr-3 file:rounded-full file:border file:border-[#db0f0f] file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#db0f0f]"
              />
            </Field>
            {previews.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {previews.map((url, index) => (
                  <li key={url} className="size-20 overflow-hidden rounded-lg border border-black/10">
                    <img src={url} alt={`Prévia ${index + 1}`} className="size-full object-cover" />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-[#898781]">{photos.length} foto(s) selecionada(s).</p>
          </div>

          <div className="sm:col-span-2">
            <Field label="Ação imediata">
              <TextArea value={immediateAction} onChange={(event) => setImmediateAction(event.target.value)} />
            </Field>
          </div>

          <div className="sm:col-span-2 rounded-lg border border-black/10 p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-[#db0f0f]"
                checked={needsFormUpdate}
                onChange={(event) => setNeedsFormUpdate(event.target.checked)}
              />
              Abrangência: o ocorrido exige alterar o formulário de coleta
            </label>
            {needsFormUpdate && (
              <div className="mt-3">
                <Field label="Alteração necessária" required>
                  <TextArea value={formChange} onChange={(event) => setFormChange(event.target.value)} required />
                </Field>
              </div>
            )}
          </div>
        </fieldset>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button type="submit" className="rounded-full" disabled={isSaving}>
            {isSaving && <LoaderCircle className="animate-spin" />}
            {isSaving ? "Gravando..." : "Gravar coleta"}
          </Button>
        </div>
      </form>
    </div>
  )
}
