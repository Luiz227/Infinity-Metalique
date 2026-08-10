import { type FormEvent, useState } from "react"
import { LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { postJson } from "@/lib/api"
import { EmployeePicker, Field, SelectField, TextArea, TextInput, textOptions } from "@/pages/quality/forms/FormFields"
import type { QualityOptions } from "@/pages/quality/types"

const today = () => new Date().toISOString().slice(0, 10)

/** Formulário de abertura de RAP, com os campos da seção 3.1 do processo. */
export function RapForm({ csrfToken, options, onClose, onCreated }: {
  csrfToken: string
  options: QualityOptions
  onClose: () => void
  onCreated: (code: string) => void
}) {
  const [reportDate, setReportDate] = useState(today)
  const [actionType, setActionType] = useState("CORREÇÃO")
  const [client, setClient] = useState("")
  const [machineTypeId, setMachineTypeId] = useState("")
  const [model, setModel] = useState("")
  const [shed, setShed] = useState(options.sheds[0] ?? "")
  const [sector, setSector] = useState(options.sectors[0] ?? "")
  const [gate, setGate] = useState(options.gates[0] ?? "")
  const [problemType, setProblemType] = useState("")
  const [qualityCodeId, setQualityCodeId] = useState("")
  const [description, setDescription] = useState("")
  const [employeeIds, setEmployeeIds] = useState<(number | null)[]>([null, null, null])
  const [needsChecklistUpdate, setNeedsChecklistUpdate] = useState(false)
  const [checklistChange, setChecklistChange] = useState("")
  const [immediateAction, setImmediateAction] = useState("")
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
      const payload = await postJson<{ message: string; report: { code: string } }>(
        "/backend/api/quality/report-create.php",
        {
          csrfToken,
          reportDate,
          actionType,
          client,
          machineTypeId: Number(machineTypeId),
          model,
          shed,
          sector,
          gate,
          problemType,
          qualityCodeId: Number(qualityCodeId),
          description,
          needsChecklistUpdate,
          checklistChange,
          immediateAction,
          employeeIds: employeeIds.filter((id): id is number => id !== null),
        },
      )
      onCreated(payload.report.code)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-auto bg-black/45 p-4 py-8" role="dialog" aria-modal="true" aria-labelledby="rap-form-title">
      <form className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 text-[#0b0b0b] shadow-2xl" onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="rap-form-title" className="text-xl font-semibold">Novo apontamento (RAP)</h2>
            <p className="mt-1 text-xs text-[#52514e]">O número do relatório é gerado na gravação.</p>
          </div>
          <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label="Fechar"><X /></Button>
        </div>

        {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

        <fieldset className="mt-5 grid gap-4 sm:grid-cols-2" disabled={isSaving}>
          <Field label="Data" required>
            <TextInput type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} required />
          </Field>

          <Field label="Identificação" required hint="Correção resolve no local; RNC abre não conformidade.">
            <SelectField
              ariaLabel="Identificação"
              value={actionType}
              onValueChange={setActionType}
              options={textOptions(options.actionTypes)}
            />
          </Field>

          <Field label="Cliente / lote" required>
            <Combobox
              value={client}
              onChange={setClient}
              options={options.clients.map((item) => item.name)}
              placeholder="Nome do cliente ou número do lote"
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

          <Field label="Barracão" hint="Origem da ação corretiva.">
            <SelectField ariaLabel="Barracão" value={shed} onValueChange={setShed} options={textOptions(options.sheds)} />
          </Field>

          <Field label="Área da ação corretiva" required>
            <SelectField ariaLabel="Área da ação corretiva" value={sector} onValueChange={setSector} options={textOptions(options.sectors)} />
          </Field>

          <Field label="Gate" required>
            <SelectField ariaLabel="Gate" value={gate} onValueChange={setGate} options={textOptions(options.gates)} />
          </Field>

          <Field label="Local da não conformidade" required>
            <SelectField
              ariaLabel="Local da não conformidade"
              value={problemType}
              onValueChange={setProblemType}
              options={textOptions(options.problemTypes)}
            />
          </Field>

          <Field label="Código do problema" required>
            <SelectField
              ariaLabel="Código do problema"
              value={qualityCodeId}
              onValueChange={setQualityCodeId}
              options={options.codes.map((code) => ({ value: String(code.id), label: `${code.code} — ${code.description}` }))}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Descrição do ocorrido" required hint="Mínimo de 10 caracteres.">
              <TextArea value={description} onChange={(event) => setDescription(event.target.value)} required />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Colaboradores envolvidos" required hint="Até três — é o que alimenta o indicador individual.">
              <EmployeePicker employees={options.employees} value={employeeIds} onChange={setEmployeeIds} />
            </Field>
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
                checked={needsChecklistUpdate}
                onChange={(event) => setNeedsChecklistUpdate(event.target.checked)}
              />
              Abrangência: este apontamento exige atualizar o checklist
            </label>
            {needsChecklistUpdate && (
              <div className="mt-3">
                <Field label="Alteração necessária" required>
                  <TextArea value={checklistChange} onChange={(event) => setChecklistChange(event.target.value)} required />
                </Field>
              </div>
            )}
          </div>
        </fieldset>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button type="submit" className="rounded-full" disabled={isSaving}>
            {isSaving && <LoaderCircle className="animate-spin" />}
            {isSaving ? "Gravando..." : "Gravar apontamento"}
          </Button>
        </div>
      </form>
    </div>
  )
}
