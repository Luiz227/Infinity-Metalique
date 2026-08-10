/** Formatações compartilhadas pela view de qualidade. */

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })

/** Converte 2026-01-05 em 05/01/2026 sem passar pelo fuso do navegador. */
export function formatDate(value: string | null): string {
  if (!value) return "—"

  const [year, month, day] = value.slice(0, 10).split("-").map(Number)
  if (!year || !month || !day) return value

  return dateFormatter.format(new Date(year, month - 1, day))
}

/** Percentual com uma casa, no padrão brasileiro. */
export function formatPercent(value: number | null): string {
  if (value === null) return "—"

  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}
