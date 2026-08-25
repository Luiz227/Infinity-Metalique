import { type ReactNode, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import type { ChartTable } from "@/pages/quality/charts/ChartCard"
import {
  ChartModeProvider,
  MIN_PRINT_CHART_HEIGHT,
  PRINT_CHART_HEIGHT,
} from "@/pages/quality/charts/ChartMode"
import { useQualityPrintContext } from "@/pages/quality/print/PrintContext"
import { PrintHeader, today } from "@/pages/quality/print/PrintHeader"

/** O gráfico é largo por natureza e sai deitado; a tabela é uma lista e sai em pé. */
const LANDSCAPE = `@media print { @page { size: A4 landscape; margin: 12mm } }`

/** Altura útil do A4 deitado: 210mm menos as duas margens de 12mm do `@page`. */
const USABLE_MM = 186

/** Uma folga para arredondamento não empurrar a última linha para a folha seguinte. */
const SLACK_PX = 6

/**
 * Rede de segurança: se o `afterprint` não vier (a caixa de impressão do
 * Electron nem sempre o dispara), a folha se desmonta sozinha em vez de deixar
 * um segundo gráfico vivo fora da tela.
 */
const TEARDOWN_FALLBACK_MS = 60_000

/** Prazo para o quadro de desenho, quando o navegador estiver segurando os quadros. */
const PAINT_TIMEOUT_MS = 250

/**
 * Quanto o gráfico pode ter de altura para a folha não passar de uma página.
 *
 * O que não é gráfico - cabeçalho, descrição, contexto e o texto que o cartão
 * traz abaixo do visual - tem a altura que tem; o gráfico fica com a sobra. A
 * régua de 100mm existe porque o mm->px do navegador não é necessariamente
 * 96dpi, e é a mesma medida que a folha do RAP faz para contar páginas.
 *
 * Devolve `null` quando não há gráfico nenhum para ajustar.
 */
function fitChart(host: HTMLDivElement | null): number | null {
  if (!host) return null

  const ruler = document.createElement("div")
  ruler.style.cssText = "height:100mm"
  host.appendChild(ruler)
  const pxPerMm = ruler.getBoundingClientRect().height / 100
  ruler.remove()
  if (!pxPerMm) return null

  const charts = [...host.querySelectorAll('[data-slot="chart"]')]
  const chartsPx = charts.reduce((total, chart) => total + chart.getBoundingClientRect().height, 0)
  if (!charts.length || !chartsPx) return null

  const restPx = host.getBoundingClientRect().height - chartsPx
  const available = (USABLE_MM * pxPerMm - restPx - SLACK_PX) / charts.length

  return Math.round(Math.min(PRINT_CHART_HEIGHT, Math.max(MIN_PRINT_CHART_HEIGHT, available)))
}

/**
 * A folha A4 de um gráfico em tela cheia.
 *
 * Ela não é uma foto nem um clone do que está na tela: é um segundo render dos
 * mesmos filhos do cartão, dentro de uma caixa com a largura útil do papel. O
 * Recharts desenha o SVG já na geometria da folha, então o rótulo de 14px sai em
 * ~10pt impressos - encolher um desenho de 1900px para 273mm deixaria o mesmo
 * rótulo em 6pt. Como são os mesmos filhos, o recorte clicado, a cor da seção e
 * os dados vêm de graça: o que está na tela é o que vai ao papel.
 *
 * O esqueleto é a mesma tabela de uma coluna da folha do RAP - repetir o
 * cabeçalho em toda folha é coisa que só o `<thead>` faz. Na visão de tabela
 * ele ganha uma segunda linha com os nomes das colunas, que passam a se repetir
 * junto. Não há `<tfoot>`: gráfico não se assina.
 */
export function ChartPrintSheet({ title, description, table, showTable, onDone, children }: {
  title: string
  description?: string
  table?: ChartTable
  /** Qual view está no ar: a tabela do cartão ou o gráfico. */
  showTable: boolean
  /** Chamado quando a caixa de impressão fecha, para o cartão desmontar a folha. */
  onDone: () => void
  children: ReactNode
}) {
  const { section, context } = useQualityPrintContext()
  const printTable = showTable && table ? table : null
  const [chartHeight, setChartHeight] = useState(PRINT_CHART_HEIGHT)
  const host = useRef<HTMLDivElement | null>(null)

  // O `onDone` do cartão é recriado a cada render; guardá-lo num ref mantém o
  // efeito preso ao ciclo de vida da folha, e não à identidade da função.
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      done.current()
    }

    let cancelled = false
    let fallback = 0

    // Dois quadros: o Recharts mede a caixa num quadro e pinta no seguinte.
    // Com prazo, porque o navegador engasga os quadros de uma aba em segundo
    // plano - e uma impressão que nunca chega é pior que uma folha por medir.
    const painted = () => Promise.race([
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      new Promise((resolve) => window.setTimeout(resolve, PAINT_TIMEOUT_MS)),
    ])

    const run = async () => {
      // Fonte carregada muda a altura do texto do cabeçalho, e é a altura dele
      // que decide quanto sobra para o gráfico.
      await document.fonts.ready
      await painted()
      if (cancelled) return

      // O cartão pode trazer texto abaixo do visual (a lista dos "Top 3"), e
      // esse texto vem de quem chamou - não dá para prever quanto ele ocupa.
      // Então a folha se mede: o que não é gráfico tem a altura que tem, e o
      // gráfico fica com o que sobrar da folha. Sem isso, um cartão com lista
      // atravessa para uma segunda página com um palmo de gráfico nela.
      if (!printTable) {
        const fitted = fitChart(host.current)
        if (fitted !== null) {
          setChartHeight(fitted)
          await painted()
          if (cancelled) return
        }
      }

      window.addEventListener("afterprint", finish, { once: true })
      fallback = window.setTimeout(finish, TEARDOWN_FALLBACK_MS)
      window.print()
      // No Chromium o `print()` só volta quando a caixa fecha, e o `afterprint`
      // vem logo atrás. No Electron ele volta na hora, e aí quem fecha a folha
      // é mesmo o evento - por isso nada é desmontado aqui.
    }

    void run()

    return () => {
      cancelled = true
      window.clearTimeout(fallback)
      window.removeEventListener("afterprint", finish)
    }
    // Sem dependências de propósito: a folha nasce para uma impressão só e o
    // cartão a desmonta quando a caixa fecha.
  }, [])

  return createPortal(
    <div ref={host} className={`quality-chart-print ${printTable ? "" : "is-landscape"}`} aria-hidden="true">
      {/* O `@page` do quality.css é retrato. Um <style> no corpo vem depois na
          ordem do documento, então é ele que vale enquanto a folha existir. */}
      {!printTable && <style>{LANDSCAPE}</style>}

      <table className="quality-chart-print-doc">
        <thead>
          <tr>
            <td className="p-0" colSpan={printTable?.head.length ?? 1}>
              <PrintHeader
                eyebrow={section ? "Seção" : "Impresso em"}
                code={section}
                date={today()}
                title={title}
                subtitle={description}
                context={context.join(" · ")}
              />
            </td>
          </tr>
          {printTable && (
            <tr>
              {printTable.head.map((cell) => (
                <th key={cell} className="border-b border-[#e1e0d9] pb-2 pr-3 pt-4 text-left text-[12px] font-semibold text-[#52514e]">
                  {cell}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {printTable ? (
            printTable.rows.map((row, index) => (
              <tr key={index} className="border-b border-[#f0efec]">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="py-1.5 pr-3 text-[13px] text-[#0b0b0b]">{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="p-0 pt-4">
                <ChartModeProvider mode="print" printHeight={chartHeight}>{children}</ChartModeProvider>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>,
    document.body,
  )
}
