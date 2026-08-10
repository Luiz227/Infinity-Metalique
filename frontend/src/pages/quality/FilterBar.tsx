import { FilterX } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { QualityFilters, QualityOptions } from "@/pages/quality/types"

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

/** O Radix reserva o valor vazio para o placeholder, então "sem filtro" vira um valor próprio. */
const TODOS = "__todos__"

function Field({ label, value, placeholder, options, onChange }: {
  label: string
  value: string | null
  placeholder: string
  options: { value: string; label: string }[]
  onChange: (value: string | null) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-[#898781]">{label}</span>
      <Select
        value={value ?? TODOS}
        onValueChange={(escolhido) => onChange(escolhido === TODOS ? null : escolhido)}
      >
        <SelectTrigger aria-label={label} className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Uma única barra de filtros acima de tudo que ela recorta: todas as seções
 * respondem ao mesmo recorte, sem filtro dentro de cartão.
 */
export function FilterBar({ filters, options, onChange, onReset }: {
  filters: QualityFilters
  options: QualityOptions | null
  onChange: (filters: QualityFilters) => void
  onReset: () => void
}) {
  const set = (patch: Partial<QualityFilters>) => onChange({ ...filters, ...patch })
  const numero = (value: string | null) => (value === null ? null : Number(value))

  const models = options
    ? options.machineModels.filter(
        (model) => !filters.machineTypeId || Number(model.machineTypeId) === filters.machineTypeId,
      )
    : []

  const isFiltered = Object.values(filters).some((value) => value !== null)

  // Grade em vez de flex-wrap: são nove filtros mais o botão, e no flex o campo
  // que sobrava na última linha esticava sozinho pela largura toda.
  return (
    <div className="grid grid-cols-2 items-end gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.06)] sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-10">
      <Field
        label="Ano"
        placeholder="Todos"
        value={filters.year?.toString() ?? null}
        options={(options?.years ?? []).map((year) => ({ value: String(year), label: String(year) }))}
        onChange={(value) => set({ year: numero(value) })}
      />

      <Field
        label="Mês"
        placeholder="Todos"
        value={filters.month?.toString() ?? null}
        options={MONTHS.map((month, index) => ({ value: String(index + 1), label: month }))}
        onChange={(value) => set({ month: numero(value) })}
      />

      <Field
        label="Barracão"
        placeholder="Todos"
        value={filters.shed}
        options={(options?.sheds ?? []).map((shed) => ({ value: shed, label: shed }))}
        onChange={(shed) => set({ shed })}
      />

      <Field
        label="Gate"
        placeholder="Todos"
        value={filters.gate}
        options={(options?.gates ?? []).map((gate) => ({ value: gate, label: gate }))}
        onChange={(gate) => set({ gate })}
      />

      <Field
        label="Problema"
        placeholder="Todos"
        value={filters.problemType}
        options={(options?.problemTypes ?? []).map((type) => ({ value: type, label: type }))}
        onChange={(problemType) => set({ problemType })}
      />

      <Field
        label="Código"
        placeholder="Todos"
        value={filters.codeId?.toString() ?? null}
        options={(options?.codes ?? []).map((code) => ({
          value: String(code.id),
          label: `${code.code} — ${code.description}`,
        }))}
        onChange={(value) => set({ codeId: numero(value) })}
      />

      <Field
        label="Máquina"
        placeholder="Todas"
        value={filters.machineTypeId?.toString() ?? null}
        options={(options?.machineTypes ?? []).map((type) => ({ value: String(type.id), label: type.name }))}
        // Trocar a máquina invalida o modelo escolhido, que pertence a outra linha.
        onChange={(value) => set({ machineTypeId: numero(value), model: null })}
      />

      <Field
        label="Modelo"
        placeholder="Todos"
        value={filters.model}
        options={models.map((model) => ({ value: model.name, label: model.name }))}
        onChange={(model) => set({ model })}
      />

      <Field
        label="Colaborador"
        placeholder="Todos"
        value={filters.employeeId?.toString() ?? null}
        options={(options?.employees ?? []).map((employee) => ({ value: String(employee.id), label: employee.name }))}
        onChange={(value) => set({ employeeId: numero(value) })}
      />

      <button
        type="button"
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-black/10 px-3 text-sm text-[#52514e] transition-colors hover:bg-neutral-50 disabled:opacity-40"
        onClick={onReset}
        disabled={!isFiltered}
      >
        <FilterX className="size-4" /> Limpar
      </button>
    </div>
  )
}
