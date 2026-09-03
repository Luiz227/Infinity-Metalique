import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ImagePlus, LoaderCircle, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Scroller } from "@/components/ui/scroller"
import { Combobox } from "@/components/ui/combobox"
import { postForm } from "@/lib/api"
import { todayIso } from "@/pages/quality/format"
import { EmployeePicker, Field, SelectField, TextArea, TextInput } from "@/pages/quality/forms/FormFields"
import type { DispatchDetail, QualityOptions } from "@/pages/quality/types"

type NewPhoto = {
  kind: "new"
  id: string
  file: File
  preview: string
}

type ExistingPhoto = {
  kind: "existing"
  id: string
  path: string
  preview: string
}

type SelectedPhoto = NewPhoto | ExistingPhoto

const employeeSlots = (ids: number[] = []): (number | null)[] => (
  Array.from({ length: 3 }, (_, index) => ids[index] ?? null)
)

/** Produto Coletado: exige no mínimo uma foto do carregamento. */
export function DispatchForm({ csrfToken, options, onClose, onCreated, inline = false, initial }: {
  csrfToken: string
  options: QualityOptions
  onClose: () => void
  onCreated: (code: string, message?: string) => void
  inline?: boolean
  initial?: DispatchDetail
}) {
  const isEditing = initial !== undefined
  const [dispatchDate, setDispatchDate] = useState(() => initial?.dispatch_date.slice(0, 10) ?? todayIso())
  const [client, setClient] = useState(initial?.client ?? "")
  const [machineTypeId, setMachineTypeId] = useState(
    initial?.machine_type_id == null ? "" : String(initial.machine_type_id),
  )
  const [model, setModel] = useState(initial?.model ?? "")
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [employeeIds, setEmployeeIds] = useState<(number | null)[]>(() => employeeSlots(initial?.employee_ids))
  const [needsFormUpdate, setNeedsFormUpdate] = useState(Boolean(initial?.needs_form_update))
  const [formChange, setFormChange] = useState(initial?.form_change ?? "")
  const [immediateAction, setImmediateAction] = useState(initial?.immediate_action ?? "")
  const [photos, setPhotos] = useState<SelectedPhoto[]>(() => (
    initial?.photos.map((path, index) => ({
      kind: "existing",
      id: `existing-${index}-${path}`,
      path,
      preview: path.startsWith("/") ? path : `/${path}`,
    })) ?? []
  ))
  const photoUrls = useRef(new Set<string>())
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const models = options.machineModels.filter(
    (item) => !machineTypeId || String(item.machineTypeId) === machineTypeId,
  )
  const employees = [
    ...options.employees,
    ...(initial?.employee_ids.flatMap((id, index) => (
      options.employees.some((employee) => Number(employee.id) === id)
        ? []
        : [{ id, name: initial.employees[index] ?? `Colaborador #${id}` }]
    )) ?? []),
  ]

  // As URLs locais existem apenas enquanto o formulário estiver aberto.
  useEffect(() => () => {
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url))
    photoUrls.current.clear()
  }, [])

  const selectPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Permite escolher novamente o mesmo arquivo depois de removê-lo.
    event.target.value = ""

    if (!file) return
    if (photos.length >= 6) {
      setError("Envie no máximo seis fotos por coleta.")
      return
    }

    const alreadyAdded = photos.some((item) => item.kind === "new" && (
      item.file.name === file.name
      && item.file.size === file.size
      && item.file.lastModified === file.lastModified
    ))
    if (alreadyAdded) {
      setError("Essa foto já foi adicionada.")
      return
    }

    const preview = URL.createObjectURL(file)
    photoUrls.current.add(preview)
    setPhotos((current) => [...current, { kind: "new", id: crypto.randomUUID(), file, preview }])
    setError("")
  }

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const removed = current.find((item) => item.id === id)
      if (removed?.kind === "new") {
        URL.revokeObjectURL(removed.preview)
        photoUrls.current.delete(removed.preview)
      }
      return current.filter((item) => item.id !== id)
    })
    setError("")
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    // Fotos retidas e novas formam um conjunto só para os limites da coleta.
    if (photos.length < 1) {
      setError("Envie pelo menos uma foto do carregamento.")
      return
    }
    if (photos.length > 6) {
      setError("Envie no máximo seis fotos por coleta.")
      return
    }

    setIsSaving(true)
    setError("")

    const body = new FormData()
    if (initial) body.append("id", String(initial.id))
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
    for (const photo of photos) {
      if (photo.kind === "existing") body.append("keptPhotos[]", photo.path)
      else body.append("photos[]", photo.file)
    }

    try {
      const payload = await postForm<{ message: string; dispatch: { code: string } }>(
        `/backend/api/quality/${isEditing ? "dispatch-update" : "dispatch-create"}.php`,
        body,
      )
      onCreated(payload.dispatch.code, payload.message)
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
      aria-labelledby="dispatch-form-title"
    >
      <form className={`mx-auto w-full max-w-3xl bg-white p-6 text-ink ${inline ? "rounded-lg border border-hairline" : "rounded-2xl shadow-2xl"}`} onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="dispatch-form-title" className="text-xl font-semibold">
              {isEditing ? `Editar produto coletado ${initial?.code}` : "Novo produto coletado"}
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              {isEditing ? "As alterações ficarão registradas no histórico." : "O número da coleta é gerado na gravação."}
            </p>
          </div>
          <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label="Fechar" disabled={isSaving}><X /></Button>
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
              <EmployeePicker employees={employees} value={employeeIds} onChange={setEmployeeIds} />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Fotos do carregamento" required hint="Adicione uma por vez. Mínimo de uma, máximo de seis; até 5 MB cada.">
              <label className={`inline-flex items-center gap-2 rounded-full border border-metalique px-4 py-2 text-sm font-semibold text-metalique ${photos.length >= 6 ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-red-50"}`}>
                <ImagePlus className="size-4" aria-hidden="true" />
                {photos.length >= 6 ? "Limite atingido" : "Adicionar uma foto"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={selectPhoto}
                  disabled={photos.length >= 6}
                  className="sr-only"
                />
              </label>
            </Field>
            {photos.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {photos.map((photo, index) => (
                  <li key={photo.id} className="group relative size-20 overflow-hidden rounded-lg border border-hairline">
                    <img src={photo.preview} alt={`Prévia ${index + 1}`} className="size-full object-cover" />
                    <button
                      type="button"
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/70 text-white shadow hover:bg-black"
                      onClick={() => removePhoto(photo.id)}
                      aria-label={`Remover foto ${index + 1}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-ink-muted">
              {photos.length} foto(s) {isEditing ? "mantida(s) na coleta" : "selecionada(s)"}.
            </p>
          </div>

          <div className="sm:col-span-2">
            <Field label="Ação imediata">
              <TextArea value={immediateAction} onChange={(event) => setImmediateAction(event.target.value)} />
            </Field>
          </div>

          <div className="sm:col-span-2 rounded-lg border border-hairline p-4">
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
            {isSaving ? (isEditing ? "Salvando..." : "Gravando...") : (isEditing ? "Salvar alterações" : "Gravar coleta")}
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
