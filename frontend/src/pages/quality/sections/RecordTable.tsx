import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight, Eye } from "lucide-react"

import { Scroller } from "@/components/ui/scroller"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { HORIZONTAL_TABLE } from "@/lib/smoothScroll"
import {
  RecordDeleteButton,
  type RecordKind,
  type RecordTarget,
} from "@/pages/quality/RecordDeleteDialog"
import type { Paginated } from "@/pages/quality/types"

/**
 * A moldura das listagens da qualidade: tabela paginada com coluna de ações.
 *
 * Mora aqui, e não dentro da aba Registros, porque a aba Planos de ação usa a
 * mesma - e uma segunda cópia sairia de sincronia na primeira mudança de estilo.
 */

export const PER_PAGE_OPTIONS = [25, 50, 100]

/**
 * Quais números cabem na barra: a primeira, a última e a vizinhança da atual.
 * No máximo sete itens, para a paginação não empurrar o seletor de tipo quando
 * o filtro abre para centenas de páginas.
 */
function pageWindow(page: number, lastPage: number): number[] {
  const wanted = new Set([1, lastPage, page - 1, page, page + 1])

  return [...wanted].filter((item) => item >= 1 && item <= lastPage).sort((a, b) => a - b)
}

export function Pagination({ records, page, onPageChange }: {
  records: Paginated<unknown> | null
  page: number
  onPageChange: (page: number) => void
}) {
  if (!records || records.total <= records.perPage) return null

  const lastPage = Math.max(1, Math.ceil(records.total / records.perPage))
  const visible = pageWindow(page, lastPage)
  const step = "grid size-7 place-items-center rounded-full border border-hairline hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-transparent"

  return (
    <nav className="flex items-center gap-1 text-xs text-ink-soft" aria-label="Paginação">
      <button
        type="button"
        className={step}
        aria-label="Página anterior"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        <ChevronLeft className="size-3.5" />
      </button>

      {visible.map((item, index) => (
        <span key={item} className="flex items-center gap-1">
          {/* O salto entre dois números vira reticências, não um botão: não há
              página única para onde ele levaria. */}
          {index > 0 && item - visible[index - 1] > 1 && (
            <span className="px-0.5 text-ink-muted" aria-hidden="true">…</span>
          )}
          <button
            type="button"
            aria-label={`Página ${item}`}
            aria-current={item === page ? "page" : undefined}
            className={`grid size-7 place-items-center rounded-full [font-variant-numeric:tabular-nums] ${
              item === page
                ? "bg-metalique font-semibold text-white"
                : "border border-hairline hover:bg-neutral-50"
            }`}
            onClick={() => onPageChange(item)}
          >
            {item}
          </button>
        </span>
      ))}

      <button
        type="button"
        className={step}
        aria-label="Próxima página"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= lastPage}
      >
        <ChevronRight className="size-3.5" />
      </button>
    </nav>
  )
}

/**
 * Só aparece quando há mais registros do que a menor opção: abaixo disso todas
 * as opções mostrariam a mesma tabela.
 */
export function PerPage({ records, perPage, onPerPageChange }: {
  records: Paginated<unknown> | null
  perPage: number
  onPerPageChange: (perPage: number) => void
}) {
  if (!records || records.total <= PER_PAGE_OPTIONS[0]) return null

  return (
    <label className="flex items-center gap-1.5 text-xs text-ink-soft">
      Linhas
      <Select value={String(perPage)} onValueChange={(value) => onPerPageChange(Number(value))}>
        <SelectTrigger aria-label="Linhas por página" className="h-7 w-auto gap-1 px-2 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PER_PAGE_OPTIONS.map((option) => (
            <SelectItem key={option} value={String(option)}>{option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

/** Célula de texto livre: trunca na linha e devolve o inteiro no title. */
export function Free({ value }: { value: string | null }) {
  return (
    <span className="block max-w-[26ch] truncate" title={value ?? undefined}>
      {value ?? "-"}
    </span>
  )
}

/**
 * O corpo da tabela de um tipo de registro. Só as colunas de dados mudam entre
 * eles: a moldura, os estados de carregando/vazio e a coluna de ações são as
 * mesmas, então moram aqui e não em cada chamada.
 */
export function RecordTable<T extends { id: number; code: string | null }>({
  kind, head, cells, records, empty, canDelete, viewLabel = "Visualizar", onView, onSelectDelete,
}: {
  kind: RecordKind
  head: string[]
  cells: (item: T) => ReactNode[]
  records: Paginated<T> | null
  empty: string
  canDelete: boolean
  /** O plano abre para ser tratado, não só lido. */
  viewLabel?: string
  onView: (id: number) => void
  onSelectDelete: (target: RecordTarget) => void
}) {
  const columns = head.length + 1

  return (
    <Scroller className="mt-3 overflow-auto" options={HORIZONTAL_TABLE}>
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="text-ink-muted">
            {[...head, "Ações"].map((title) => (
              <th
                key={title}
                className="border-b border-[#e1e0d9] pb-1.5 pr-3 text-xs font-medium uppercase tracking-wide"
              >
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!records && (
            <tr><td className="py-2.5 text-ink-muted" colSpan={columns}>Carregando registros...</td></tr>
          )}
          {records?.items.length === 0 && (
            <tr><td className="py-2.5 text-ink-muted" colSpan={columns}>{empty}</td></tr>
          )}
          {records?.items.map((item) => (
            <tr key={item.id} className="border-b border-[#f0efec] last:border-0 align-top">
              {cells(item).map((cell, index) => (
                <td
                  key={index}
                  className={index === 0
                    ? "py-1.5 pr-3 font-medium text-ink [font-variant-numeric:tabular-nums]"
                    : "py-1.5 pr-3 text-ink-soft"}
                >
                  {cell}
                </td>
              ))}
              <td className="py-1.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[11px] text-ink-soft hover:bg-neutral-50"
                    onClick={() => onView(item.id)}
                  >
                    <Eye className="size-3" /> {viewLabel}
                  </button>
                  {canDelete && (
                    <RecordDeleteButton
                      target={{ kind, id: item.id, code: item.code ?? "-" }}
                      onSelect={onSelectDelete}
                      className="px-2 py-0.5 text-[11px]"
                      iconClassName="size-3"
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Scroller>
  )
}
