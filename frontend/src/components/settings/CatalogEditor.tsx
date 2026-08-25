import { type ReactNode } from "react"
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * As peças de uma lista editável dentro da central de configurações.
 *
 * Nasceram no painel da Qualidade e vieram para cá quando os ramais pediram a
 * mesma coisa: ordem, ativo/inativo, remoção e um botão de acrescentar. Só os
 * campos do meio de cada linha mudam de painel para painel - eles entram como
 * `children`.
 */
export function CatalogSection({ title, description, addLabel, disabled, onAdd, children }: {
  title: string
  description: string
  addLabel: string
  disabled: boolean
  onAdd: () => void
  children: ReactNode
}) {
  return (
    <section className="rounded-md border border-hairline p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-ink-muted">{description}</p>
        </div>
        <Button type="button" variant="outline" onClick={onAdd} disabled={disabled}>
          <Plus /> {addLabel}
        </Button>
      </div>
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  )
}

/**
 * Uma linha da lista. `lockedLabel` é o que aparece no lugar da lixeira quando a
 * linha não pode ser apagada - no painel da Qualidade, a contagem de RAPs que a
 * usam, que é a resposta a "por que não dá para apagar". Sem ele, a lixeira fica.
 */
export function CatalogRow({
  index,
  total,
  active,
  lockedLabel,
  lockedTitle,
  disabled,
  onMove,
  onToggle,
  onRemove,
  children,
}: {
  index: number
  total: number
  active: boolean
  lockedLabel?: string | null
  lockedTitle?: string
  disabled: boolean
  onMove: (to: number) => void
  onToggle: () => void
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface p-2">
      <div className="flex flex-col">
        <button
          type="button"
          className="grid size-5 place-items-center rounded text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
          aria-label="Subir na ordem"
          disabled={disabled || index === 0}
          onClick={() => onMove(index - 1)}
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          className="grid size-5 place-items-center rounded text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
          aria-label="Descer na ordem"
          disabled={disabled || index === total - 1}
          onClick={() => onMove(index + 1)}
        >
          <ChevronDown className="size-4" />
        </button>
      </div>

      <div className="min-w-[12rem] flex-1">{children}</div>

      <button
        type="button"
        aria-pressed={active}
        disabled={disabled}
        onClick={onToggle}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
          active
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-hairline bg-neutral-50 text-ink-muted"
        }`}
      >
        {active ? "Ativo" : "Inativo"}
      </button>

      {lockedLabel ? (
        <span className="whitespace-nowrap px-2 text-xs text-ink-muted" title={lockedTitle}>
          {lockedLabel}
        </span>
      ) : (
        <button
          type="button"
          className="grid size-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-red-50 hover:text-[#b00c0c] disabled:opacity-40"
          aria-label="Remover"
          disabled={disabled}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  )
}

export function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items

  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)

  return next
}

export function patch<T>(items: T[], index: number, changes: Partial<T>): T[] {
  return items.map((item, position) => (position === index ? { ...item, ...changes } : item))
}

/** `key` existe só para o React: linhas novas ainda não têm id do banco. */
let draftKeySeed = 0

export function nextDraftKey(): string {
  return `novo-${++draftKeySeed}`
}
