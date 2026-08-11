import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** Peças compartilhadas pelos dois formulários de lançamento. */

export function Field({ label, hint, required = false, children }: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[#52514e]">
        {label}
        {required && <span className="text-[#db0f0f]" aria-hidden="true"> *</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-[#898781]">{hint}</span>}
    </label>
  )
}

const control =
  "h-10 rounded-lg border border-black/10 bg-white px-3 text-sm text-[#0b0b0b] outline-none focus-visible:ring-2 focus-visible:ring-[#db0f0f]/35"

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ""}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-[88px] rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-[#0b0b0b] outline-none focus-visible:ring-2 focus-visible:ring-[#db0f0f]/35 ${props.className ?? ""}`}
    />
  )
}

export type Option = { value: string; label: string }

/** Escolha única sobre o Select do shadcn. Valor vazio mostra o placeholder. */
export function SelectField({ value, onValueChange, options, placeholder = "Selecione", ariaLabel }: {
  value: string
  onValueChange: (value: string) => void
  options: Option[]
  placeholder?: string
  ariaLabel?: string
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Converte uma lista de textos em opções cujo valor é o próprio texto. */
export function textOptions(values: readonly string[]): Option[] {
  return values.map((value) => ({ value, label: value }))
}

/** O Radix não aceita item com valor vazio, então "sem colaborador" ganha um valor próprio. */
const SEM_COLABORADOR = "__nenhum__"

/**
 * Até três colaboradores por registro - é o que alimenta o indicador individual.
 * Cada posição é um campo próprio para deixar claro o limite.
 */
export function EmployeePicker({ employees, value, onChange }: {
  employees: { id: number; name: string }[]
  value: (number | null)[]
  onChange: (value: (number | null)[]) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {value.map((selected, index) => {
        const disponiveis = employees.filter(
          (employee) => !value.includes(Number(employee.id)) || Number(employee.id) === selected,
        )

        return (
          <SelectField
            key={index}
            ariaLabel={`Colaborador ${index + 1}`}
            placeholder={index === 0 ? "Selecione o colaborador" : "Opcional"}
            value={selected?.toString() ?? ""}
            onValueChange={(novo) => {
              const proximo = [...value]
              proximo[index] = novo === SEM_COLABORADOR ? null : Number(novo)
              onChange(proximo)
            }}
            options={[
              ...(selected !== null ? [{ value: SEM_COLABORADOR, label: "Remover" }] : []),
              ...disponiveis.map((employee) => ({ value: String(employee.id), label: employee.name })),
            ]}
          />
        )
      })}
    </div>
  )
}
