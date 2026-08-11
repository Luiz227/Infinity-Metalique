import { useState } from "react"
import { ChevronDown, FilterX, SlidersHorizontal, X } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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

type ActiveFilter = { key: keyof QualityFilters; label: string; clear: Partial<QualityFilters> }

/**
 * Os filtros preenchidos em texto legível. Com os campos escondidos dentro do
 * menu, é essa lista que mostra o recorte em vigor sem precisar abri-lo.
 */
function activeFilters(filters: QualityFilters, options: QualityOptions | null): ActiveFilter[] {
  const named = (list: { id: number; name: string }[] | undefined, id: number) =>
    list?.find((item) => Number(item.id) === id)?.name ?? String(id)

  const active: ActiveFilter[] = []

  if (filters.year !== null) active.push({ key: "year", label: `Ano: ${filters.year}`, clear: { year: null } })
  if (filters.month !== null) active.push({ key: "month", label: `Mês: ${MONTHS[filters.month - 1]}`, clear: { month: null } })
  if (filters.shed !== null) active.push({ key: "shed", label: `Barracão: ${filters.shed}`, clear: { shed: null } })
  if (filters.gate !== null) active.push({ key: "gate", label: `Gate: ${filters.gate}`, clear: { gate: null } })
  if (filters.problemType !== null) active.push({ key: "problemType", label: `Problema: ${filters.problemType}`, clear: { problemType: null } })
  if (filters.codeId !== null) {
    const code = options?.codes.find((item) => Number(item.id) === filters.codeId)
    active.push({ key: "codeId", label: `Código: ${code?.code ?? filters.codeId}`, clear: { codeId: null } })
  }
  if (filters.machineTypeId !== null) {
    // Limpar a máquina também solta o modelo, que pertence a uma linha só.
    active.push({
      key: "machineTypeId",
      label: `Máquina: ${named(options?.machineTypes, filters.machineTypeId)}`,
      clear: { machineTypeId: null, model: null },
    })
  }
  if (filters.model !== null) active.push({ key: "model", label: `Modelo: ${filters.model}`, clear: { model: null } })
  if (filters.employeeId !== null) {
    active.push({
      key: "employeeId",
      label: `Colaborador: ${named(options?.employees, filters.employeeId)}`,
      clear: { employeeId: null },
    })
  }
  if (filters.clientId !== null) {
    active.push({
      key: "clientId",
      label: `Cliente: ${named(options?.clients, filters.clientId)}`,
      clear: { clientId: null },
    })
  }

  return active
}

/**
 * Um único recorte acima de tudo que ele filtra: todas as seções respondem à
 * mesma escolha, sem filtro dentro de cartão. Os nove campos moram num menu para
 * não empurrar os gráficos para baixo; o que está em vigor fica nas pílulas ao
 * lado do gatilho, onde também pode ser desfeito um a um.
 */
export function FilterBar({ filters, options, onChange, onReset }: {
  filters: QualityFilters
  options: QualityOptions | null
  onChange: (filters: QualityFilters) => void
  onReset: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const set = (patch: Partial<QualityFilters>) => onChange({ ...filters, ...patch })
  const numero = (value: string | null) => (value === null ? null : Number(value))

  const models = options
    ? options.machineModels.filter(
        (model) => !filters.machineTypeId || Number(model.machineTypeId) === filters.machineTypeId,
      )
    : []

  const active = activeFilters(filters, options)
  const isFiltered = active.length > 0

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-colors ${
              isFiltered
                ? "border-[#db0f0f] bg-[#db0f0f] text-white hover:bg-[#c20d0d]"
                : "border-black/10 bg-white text-[#52514e] hover:bg-neutral-50"
            }`}
          >
            <SlidersHorizontal className="size-4" />
            Filtros
            {isFiltered && (
              <span className="rounded-full bg-white/25 px-1.5 text-xs font-semibold">{active.length}</span>
            )}
            <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>
        </PopoverTrigger>

        {/* O menu de cada Select é um portal no body, fora do DOM do popover:
            sem isso, escolher um valor contaria como interação fora e fecharia o
            painel inteiro. O alvo real vem no `detail`, não no `target` do evento. */}
        <PopoverContent
          align="start"
          className="w-[min(92vw,720px)] p-4"
          onInteractOutside={(event) => {
            const target = event.detail.originalEvent.target
            if (target instanceof Element && target.closest('[data-slot="select-content"]')) {
              event.preventDefault()
            }
          }}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                label: `${code.code} - ${code.description}`,
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
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-[#f0efec] pt-3">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-[#52514e] transition-colors hover:text-[#0b0b0b] disabled:opacity-40"
              onClick={onReset}
              disabled={!isFiltered}
            >
              <FilterX className="size-4" /> Limpar
            </button>
            <button
              type="button"
              className="rounded-full bg-[#db0f0f] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#c20d0d]"
              onClick={() => setIsOpen(false)}
            >
              Fechar
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {active.map((filter) => (
        <button
          key={filter.key}
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 text-sm text-[#52514e] transition-colors hover:border-black/20 hover:text-[#0b0b0b]"
          aria-label={`Remover filtro ${filter.label}`}
          onClick={() => set(filter.clear)}
        >
          {filter.label}
          <X className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
