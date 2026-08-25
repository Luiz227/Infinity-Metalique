import type { ReactNode } from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * As peças de que toda seção das configurações é feita.
 *
 * A linha é o formato do painel inteiro: rótulo e explicação à esquerda,
 * controle à direita, uma linha fina separando de quem vem depois. É ela que dá
 * o ritmo - por isso nenhuma seção desenha esse arranjo à mão.
 *
 * O controle vai numa coluna de largura própria e o texto encolhe: assim um
 * seletor comprido não fica espremido, e uma explicação longa quebra em vez de
 * empurrar o controle para fora.
 */
export function SettingsRow({ label, description, htmlFor, deviceOnly = false, control }: {
  label: string
  description?: ReactNode
  /** Quando o controle é um campo único, a etiqueta vira `<label>` dele. */
  htmlFor?: string
  /** Marca as preferências que valem para a máquina e não sobem para a conta. */
  deviceOnly?: boolean
  control: ReactNode
}) {
  const Label = htmlFor ? "label" : "span"

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-hairline py-4 last:border-b-0">
      <div className="min-w-[12rem] flex-1">
        <Label className="block text-sm font-medium text-ink" htmlFor={htmlFor}>{label}</Label>
        {description && <p className="mt-1 max-w-prose text-[13px] leading-5 text-ink-muted">{description}</p>}
        {deviceOnly && (
          <p className="mt-1.5 inline-flex rounded-full border border-hairline bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            Somente neste dispositivo
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">{control}</div>
    </div>
  )
}

/**
 * O recado de erro ou de sucesso de uma seção. Erro é `alert` e sucesso é
 * `status`: o primeiro interrompe quem usa leitor de tela, o segundo espera a
 * vez - errar ao salvar precisa ser sabido na hora, ter salvado não.
 */
export function SettingsFeedback({ error, notice }: { error?: string; notice?: string }) {
  if (error) {
    return <p className="rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-[#b00c0c]" role="alert">{error}</p>
  }
  if (notice) {
    return (
      <p className="flex items-center gap-2 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800" role="status">
        <Check className="size-4 shrink-0" />{notice}
      </p>
    )
  }

  return null
}

/** Um bloco de linhas com título. O painel é uma pilha destes. */
export function SettingsGroup({ title, description, children }: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="pb-2">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      {description && <p className="mt-1 text-[13px] leading-5 text-ink-muted">{description}</p>}
      <div className="mt-1">{children}</div>
    </section>
  )
}

/**
 * O interruptor das linhas de ligar/desligar. É um `role="switch"` de verdade, e
 * não uma caixa de seleção maquiada: leitores de tela anunciam ligado/desligado
 * em vez de marcado/desmarcado.
 */
export function SettingsSwitch({ checked, disabled = false, label, onChange }: {
  checked: boolean
  disabled?: boolean
  /** Só é lido em voz alta - na tela quem nomeia é o rótulo da linha. */
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/35 disabled:opacity-50",
        checked ? "bg-metalique" : "bg-ink/20",
      )}
    >
      <span
        className={cn(
          "block size-5 rounded-full bg-[#ffffff] shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  )
}

/**
 * Escolha entre poucas opções curtas, no formato de pílulas lado a lado - o
 * tema é o caso típico. Com mais de três ou quatro opções, ou com rótulos
 * longos, use o `Select` do projeto: aqui elas não caberiam.
 */
export function SettingsChoice<T extends string>({ value, options, label, onChange }: {
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  label: string
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-hairline bg-neutral-50 p-1" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/35",
              isActive ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
