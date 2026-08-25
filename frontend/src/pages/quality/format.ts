/** Formatações compartilhadas pela view de qualidade. */

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })

/** Converte 2026-01-05 em 05/01/2026 sem passar pelo fuso do navegador. */
export function formatDate(value: string | null): string {
  if (!value) return "-"

  const [year, month, day] = value.slice(0, 10).split("-").map(Number)
  if (!year || !month || !day) return value

  return dateFormatter.format(new Date(year, month - 1, day))
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

/**
 * "2026-07" vira "julho de 2026". O eixo do gráfico precisa do rótulo curto
 * ("jul/26") para caber; o tooltip mostra o mês por extenso.
 */
export function formatPeriod(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return ""

  const month = MONTH_NAMES[Number(match[2]) - 1]
  return month ? `${month} de ${match[1]}` : ""
}

/**
 * Hoje como 'YYYY-MM-DD', pelo relógio de quem está na tela.
 *
 * `toISOString()` não serve: ele converte para UTC, e o Brasil está três horas
 * atrás. Depois das 21h ele devolveria a data de amanhã - o que adiantaria o
 * campo de data dos formulários e marcaria como atrasado um plano ainda no prazo.
 */
export function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")

  return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, "0")}`
}

/** Percentual com uma casa, no padrão brasileiro. */
export function formatPercent(value: number | null): string {
  if (value === null) return "-"

  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}
