import { type FormEvent, useState } from "react"
import { createPortal } from "react-dom"
import { LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Scroller } from "@/components/ui/scroller"
import { Combobox } from "@/components/ui/combobox"
import { postJson } from "@/lib/api"
import { todayIso } from "@/pages/quality/format"
import { EmployeePicker, Field, SelectField, TextArea, TextInput, textOptions } from "@/pages/quality/forms/FormFields"
import type { QualityOptions, ReportDetail } from "@/pages/quality/types"

const employeeSlots = (ids: number[] = []): (number | null)[] => (
  Array.from({ length: 3 }, (_, index) => ids[index] ?? null)
)

/** Formulário de abertura de RAP, com os campos da seção 3.1 do processo. */
export function RapForm({ csrfToken, options, onClose, onCreated, inline = false, initial }: {
  csrfToken: string
  options: QualityOptions
  onClose: () => void
  onCreated: (code: string, message?: string) => void
  inline?: boolean
  initial?: ReportDetail
}) {
  const isEditing = initial !== undefined
  // Um RAP novo só pode nascer com catálogo ativo; o desativado fica para o
  // histórico. Na edição, porém, o valor atual precisa continuar selecionável.
  const gates = [
    ...options.gates.filter((item) => item.active || item.name === initial?.gate),
    ...(initial?.gate && !options.gates.some((item) => item.name === initial.gate)
      ? [{ name: initial.gate, active: false }]
      : []),
  ]
  const codes = options.codes.filter((item) => item.active || Number(item.id) === initial?.quality_code_id)
  const employees = [
    ...options.employees,
    ...(initial?.employee_ids.flatMap((id, index) => (
      options.employees.some((employee) => Number(employee.id) === id)
        ? []
        : [{ id, name: initial.employees[index] ?? `Colaborador #${id}` }]
    )) ?? []),
  ]
  const [reportDate, setReportDate] = useState(() => initial?.report_date.slice(0, 10) ?? todayIso())
  const [actionType, setActionType] = useState(initial?.action_type ?? "CORREÇÃO")
  const [client, setClient] = useState(initial?.client ?? "")
  const [machineTypeId, setMachineTypeId] = useState(
    initial?.machine_type_id == null ? "" : String(initial.machine_type_id),
  )
  const [model, setModel] = useState(initial?.model ?? "")
  const [shed, setShed] = useState(initial?.shed ?? options.sheds[0] ?? "")
  const [sector, setSector] = useState(initial?.sector ?? options.sectors[0] ?? "")
  const [gate, setGate] = useState(initial?.gate ?? gates[0]?.name ?? "")
  const [problemType, setProblemType] = useState(initial?.problem_type ?? "")
  const [qualityCodeId, setQualityCodeId] = useState(
    initial?.quality_code_id == null ? "" : String(initial.quality_code_id),
  )
  const [description, setDescription] = useState(initial?.description ?? "")
  const [employeeIds, setEmployeeIds] = useState<(number | null)[]>(() => employeeSlots(initial?.employee_ids))
  const [needsChecklistUpdate, setNeedsChecklistUpdate] = useState(Boolean(initial?.needs_checklist_update))
  const [checklistChange, setChecklistChange] = useState(initial?.checklist_change ?? "")
  const [immediateAction, setImmediateAction] = useState(initial?.immediate_action ?? "")
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
        `/backend/api/quality/${isEditing ? "report-update" : "report-create"}.php`,
        {
          ...(initial ? { id: initial.id } : {}),
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
      onCreated(payload.report.code, payload.message)
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
      aria-labelledby="rap-form-title"
    >
      <form className={`mx-auto w-full max-w-3xl bg-white p-6 text-ink ${inline ? "rounded-lg border border-hairline" : "rounded-2xl shadow-2xl"}`} onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="rap-form-title" className="text-xl font-semibold">
              {isEditing ? `Editar apontamento ${initial.code}` : "Novo apontamento (RAP)"}
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              {isEditing ? "As alterações ficarão registradas no histórico." : "O número do relatório é gerado na gravação."}
            </p>
          </div>
          <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label="Fechar" disabled={isSaving}><X /></Button>
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
            <SelectField
              ariaLabel="Gate"
              value={gate}
              onValueChange={setGate}
              options={gates.map((item) => ({
                value: item.name,
                label: item.active ? item.name : `${item.name} (inativo)`,
              }))}
            />
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
              options={codes.map((code) => ({
                value: String(code.id),
                label: `${code.code} - ${code.description}${code.active ? "" : " (inativo)"}`,
              }))}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Descrição do ocorrido" required hint="Mínimo de 10 caracteres.">
              <TextArea value={description} onChange={(event) => setDescription(event.target.value)} required />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Colaboradores envolvidos" required hint="Até três - é o que alimenta o indicador individual.">
              <EmployeePicker employees={employees} value={employeeIds} onChange={setEmployeeIds} />
            </Field>
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
            {isSaving ? (isEditing ? "Salvando..." : "Gravando...") : (isEditing ? "Salvar alterações" : "Gravar apontamento")}
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
