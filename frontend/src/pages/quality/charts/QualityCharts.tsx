import { type ComponentProps, useId, useLayoutEffect, useRef } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { PieSectorShapeProps } from "recharts"

import { type ChartConfig, ChartContainer } from "@/components/ui/chart"
import { useChartExpanded, useChartMode, useChartPrintHeight } from "@/pages/quality/charts/ChartMode"
import { useSeriesColor } from "@/pages/quality/charts/SeriesColor"
import { formatPeriod } from "@/pages/quality/format"
import type { GateValue, LabelValue, PeriodValue } from "@/pages/quality/types"
import { BAR_SIZE, CATEGORICAL, INK, RADIUS_BAR, RADIUS_COLUMN, SERIES, STATUS, axisProps, labelInk } from "./tokens"

const chartConfig = {
  total: { label: "Total", color: INK.axis },
  selected: { label: "Selecionado", color: SERIES },
} satisfies ChartConfig

const ANIMATION_DURATION = 580
const VERTICAL_BAR_GAP = 13
// O Recharts aplica `barCategoryGap` nos dois lados de cada categoria.
const VERTICAL_CATEGORY_INSET = VERTICAL_BAR_GAP / 2

/**
 * Guarda a última versão-base já exibida de cada gráfico durante esta sessão.
 * As abas e rotas desmontam seus gráficos; sem essa memória, o Recharts trata
 * cada retorno como uma primeira montagem e repete a animação de entrada.
 */
const chartAnimationMemory = new Map<string, string>()

type ChartAnimationState = {
  animationKey: string
  visualSignature: string
  animate: boolean
}

/** Estado do destaque numa linha, guardado para a marca seguinte entrar de onde esta parou. */
type HighlightState = { highlighting: boolean; highlights: Record<string, number> }

type HighlightRow = Record<string, unknown> & {
  label: string
  __highlighting: boolean
  __highlights: Record<string, number>
  __from?: HighlightState | null
}

type ShapeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  dataKey?: string | number
  payload?: HighlightRow
  animationElapsedTime?: number
  isAnimating?: boolean
  isEntrance?: boolean
}

type AnimatedPieSectorProps = PieSectorShapeProps & {
  animationElapsedTime?: number
  isAnimating?: boolean
  isEntrance?: boolean
}

function rowKey(row: HighlightRow): string {
  return String(row.period ?? row.label)
}

/**
 * De onde a marca deve começar a animar. Sem estado anterior (primeira pintura)
 * ela cresce do zero; vindo de um destaque, começa na parcela que estava na tela;
 * vindo do total, começa cheia.
 */
function fromRatio(row: HighlightRow | undefined, seriesKey: string, total: number): number {
  const from = row?.__from
  if (!from) return 0
  if (!from.highlighting) return 1
  return ratio(from.highlights[seriesKey] ?? 0, total)
}

/** Assinatura das linhas: diz se o dado mudou de verdade de um render para o outro. */
function rowsSignature(rows: HighlightRow[]): string {
  return JSON.stringify(rows)
}

/**
 * Anima na primeira exibição e quando o estado visual muda de verdade. Numa
 * remontagem, o mesmo dado-base já nasce pronto, mesmo que a tela anterior
 * tenha sido fechada com um recorte temporário selecionado.
 */
function useChartAnimation(
  animationKey: string,
  baseSignature: string,
  visualSignature: string,
): boolean {
  const mode = useChartMode()
  const state = useRef<ChartAnimationState | null>(null)
  let current = state.current

  if (!current || current.animationKey !== animationKey) {
    current = {
      animationKey,
      visualSignature,
      animate: chartAnimationMemory.get(animationKey) !== baseSignature,
    }
    state.current = current
  } else if (current.visualSignature !== visualSignature) {
    current = { animationKey, visualSignature, animate: true }
    state.current = current
  }

  useLayoutEffect(() => {
    chartAnimationMemory.set(animationKey, baseSignature)
  }, [animationKey, baseSignature])

  // No papel a marca nasce pronta. A folha imprime dois quadros depois de
  // montar, e uma barra a meio caminho dos 0,58s sairia impressa pela metade.
  return mode === "print" ? false : current.animate
}

/**
 * O Recharts recria as marcas sempre que os dados mudam - o `AnimatedItems` usa
 * o id da animação como `key`, então guardar o nó do DOM não adianta. Em vez
 * disso guardamos o destaque anterior e o devolvemos junto da linha: a marca
 * nova nasce exatamente onde a antiga estava e anima dali até o valor novo.
 *
 * Duas coisas seguram a animação, e as duas dependem de o render que não mudou
 * nada não contar: o ponto de partida só gira quando o dado muda, e a saída
 * mantém a mesma identidade enquanto o dado é o mesmo - assim o Recharts não
 * recria a marca à toa no meio dos 0,58s. Sem isso, o render que ele dispara ao
 * mexer o mouse (inevitável, pois o cursor está sobre a marca recém-clicada)
 * reiniciaria o progresso entregue à forma personalizada.
 */
function useHighlightTransition(rows: HighlightRow[]): HighlightRow[] {
  const previous = useRef<Map<string, HighlightState> | null>(null)
  const current = useRef<Map<string, HighlightState> | null>(null)
  const signature = useRef<string | null>(null)
  const output = useRef<HighlightRow[]>(rows)
  const next = rowsSignature(rows)

  // Derivado durante o render, e não num efeito: o render seguinte pode chegar
  // antes de o efeito rodar, e aí a marca já teria nascido no lugar errado.
  if (next !== signature.current) {
    signature.current = next
    previous.current = current.current
    current.current = new Map(
      rows.map((row) => [rowKey(row), { highlighting: row.__highlighting, highlights: row.__highlights }]),
    )
    output.current = rows.map((row) => ({ ...row, __from: previous.current?.get(rowKey(row)) ?? null }))
  }

  return output.current
}

/** Aviso curto no lugar do gráfico quando o filtro não devolve nada. */
function Empty({ height }: { height: number }) {
  return (
    <div className="grid place-items-center text-sm text-ink-muted" style={{ height }}>
      Nenhum registro para os filtros escolhidos.
    </div>
  )
}

/**
 * Moldura comum dos visuais. A animação fica com o próprio Recharts, evitando
 * dois agendadores concorrentes atualizando os mesmos atributos do SVG.
 */
function PowerChart({ height, selected, interactive, className, children }: {
  height: number
  selected?: string
  interactive: boolean
  className?: string
  children: ComponentProps<typeof ChartContainer>["children"]
}) {
  const mode = useChartMode()
  const printHeight = useChartPrintHeight()
  // No papel a altura vem da folha, sem `Math.max` com a altura de tela: é ela
  // que sabe quanto sobrou depois do cabeçalho e do texto que o cartão traz.
  const displayHeight = mode === "print"
    ? printHeight
    : mode === "fullscreen"
      ? Math.max(height, window.innerHeight - 175)
      : height
  return (
    <ChartContainer
      config={chartConfig}
      className={[interactive ? "quality-interactive-chart" : "", className ?? ""].filter(Boolean).join(" ") || undefined}
      style={{ height: displayHeight }}
      data-selected={selected}
    >
      {children}
    </ChartContainer>
  )
}

function ratio(selected: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(1, selected / total))
}

/**
 * Poucas marcas podem respirar e ganhar peso; conforme categorias e séries se
 * acumulam, o teto converge para o tamanho denso do design system. Como isto é
 * `maxBarSize`, o próprio Recharts ainda reduz a barra quando o card estreita.
 */
function adaptiveBarSize(categories: number, series = 1): number {
  const visibleMarks = Math.max(1, categories * Math.max(1, series))
  const size = 88 / Math.sqrt(visibleMarks / 2)
  return Math.round(Math.max(BAR_SIZE, Math.min(56, size)))
}

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * Math.max(0, Math.min(1, progress))
}

/** Progresso normalizado entregue pelo motor de animação nativo do Recharts. */
function shapeProgress(props: { animationElapsedTime?: number; isAnimating?: boolean }): number {
  if (!props.isAnimating) return 1
  const progress = Number(props.animationElapsedTime ?? 1)
  return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 1
}

function percentage(selected: number, total: number): number {
  return Math.round(ratio(selected, total) * 100)
}

function detailedPercentage(selected: number, total: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(ratio(selected, total) * 100)
}

/**
 * Reta de mínimos quadrados sobre a série, para responder de olho se o número
 * está subindo ou descendo - a linha mês a mês sobe e desce e o olho não fecha
 * a conta sozinho. O x é a posição do mês, e não a ordem dos pontos válidos:
 * assim um mês sem registro continua ocupando o seu lugar no tempo. Devolve
 * `null` com menos de dois pontos, quando não há tendência a traçar.
 */
function linearTrend(values: (number | null)[]): number[] | null {
  const points = values
    .map((value, index) => ({ x: index, y: value }))
    .filter((point): point is { x: number; y: number } => point.y !== null && Number.isFinite(point.y))
  if (points.length < 2) return null

  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length
  const variance = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0)
  if (variance === 0) return null

  const slope = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / variance
  const intercept = meanY - slope * meanX
  return values.map((_, index) => intercept + slope * index)
}

function mergeLabelRows(data: LabelValue[], highlightData: LabelValue[] | null): HighlightRow[] {
  const highlights = new Map((highlightData ?? []).map((row) => [row.label, row.value]))
  return data.map((row) => ({
    ...row,
    __highlighting: highlightData !== null,
    __highlights: { value: highlights.get(row.label) ?? 0 },
  }))
}

function mergePeriodRows(data: PeriodValue[], highlightData: PeriodValue[] | null): HighlightRow[] {
  const highlights = new Map((highlightData ?? []).map((row) => [row.period, row.value]))
  return data.map((row) => ({
    ...row,
    __highlighting: highlightData !== null,
    __highlights: { value: highlights.get(row.period) ?? 0 },
    highlightValue: highlightData === null ? null : highlights.get(row.period) ?? null,
  }))
}

/**
 * Tooltip shadcn, no formato do Power BI: o item, o que ele significa e o que o
 * número mede. "COD 5" traz a causa que o código representa, o mês traz a data
 * por extenso, o modelo traz a linha de produto - e durante o cross-highlight o
 * valor vira parcela sobre o total.
 */
function ChartTooltip({ active, payload, label, measure = "", unit = "" }: {
  active?: boolean
  payload?: {
    name?: string
    dataKey?: string | number
    value?: number
    color?: string
    type?: string
    payload?: HighlightRow
  }[]
  label?: string | number
  measure?: string
  unit?: string
}) {
  if (!active || !payload?.length) return null
  // O conteúdo padrão do Recharts descarta `tooltipType="none"`; como este
  // tooltip é customizado, reproduzimos a mesma regra para séries auxiliares.
  const visible = payload.filter((entry) => (
    entry.value !== undefined
    && entry.type !== "none"
  ))
  if (!visible.length) return null

  // A rosca não tem eixo de categoria: o nome da fatia é que faz o título.
  const heading = label ?? visible[0]?.name ?? ""
  const suffix = measure ? ` ${measure}` : ""

  // Derivada aqui, e não injetada na linha: a linha é o que vai para o Recharts,
  // e marca recriada por mudança de dado volta ao `initial` do Motion - texto de
  // apresentação no array de dados custaria a animação do recorte.
  const first = visible[0]?.payload
  const description = typeof first?.description === "string" && first.description !== ""
    ? first.description
    : typeof first?.period === "string" ? formatPeriod(first.period) : ""

  return (
    <div className="min-w-32 max-w-72 rounded-lg border border-hairline bg-white px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-ink">{heading}</p>
      {description && <p className="mt-0.5 leading-snug text-ink-soft">{description}</p>}
      {visible.map((entry, index) => {
        const row = entry.payload
        const key = String(entry.dataKey ?? entry.name ?? "value")
        const total = Number(entry.value ?? 0)
        const selected = row?.__highlights[key] ?? 0
        // Numa série só o campo se chama "value", que não diz nada; em gráfico de
        // várias séries o nome é o da série e precisa aparecer.
        const series = entry.name && entry.name !== "value" && entry.name !== heading ? entry.name : ""

        return (
          <div key={`${key}-${index}`} className="mt-1.5 flex items-start gap-1.5 text-ink-soft">
            <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: entry.color }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              {series && <p>{series}</p>}
              {row?.__highlighting ? (
                <p className="font-semibold text-ink">
                  {selected}{unit} de {total}{unit}{suffix} · {percentage(selected, total)}%
                </p>
              ) : (
                <p className="font-semibold text-ink">{total}{unit}{suffix}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** O Recharts devolve o ponto ativo pelo índice do tooltip nos cliques do gráfico. */
function selectedIndex(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const index = Number(value)
  return Number.isInteger(index) && index >= 0 ? index : null
}

function HorizontalPowerBar({ props }: { props: ShapeProps }) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Math.max(0, Number(props.width ?? 0))
  const height = Math.max(0, Number(props.height ?? 0))
  const color = props.fill ?? SERIES
  const seriesKey = String(props.dataKey ?? "value")
  const row = props.payload
  const total = Number(row?.[seriesKey] ?? 0)
  const selected = row?.__highlights[seriesKey] ?? 0
  const highlighting = Boolean(row?.__highlighting)
  const wasHighlighting = Boolean(row?.__from?.highlighting)
  const previousSelected = row?.__from?.highlights[seriesKey] ?? 0
  const progress = shapeProgress(props)
  const targetRatio = highlighting ? ratio(selected, total) : 1
  const startRatio = row?.__from ? fromRatio(row, seriesKey, total) : targetRatio
  const visibleWidth = width * interpolate(startRatio, targetRatio, progress)
  const visibleValue = highlighting ? selected : total
  const fromValue = row?.__from ? (wasHighlighting ? previousSelected : total) : 0
  const shownValue = Math.round(interpolate(fromValue, visibleValue, progress))
  const backgroundOpacity = interpolate(wasHighlighting ? 0.16 : 0, highlighting ? 0.16 : 0, progress)
  const percentageOpacity = interpolate(
    wasHighlighting && previousSelected > 0 ? 1 : 0,
    highlighting && total > 0 && selected > 0 ? 1 : 0,
    progress,
  )
  const valueLabelWidth = Math.max(8, String(shownValue).length * 7)
  const valueFitsInside = visibleWidth >= valueLabelWidth + 10
  const valueX = valueFitsInside ? x + visibleWidth / 2 : x + visibleWidth + 7
  const percentageOffset = valueFitsInside ? 7 : valueLabelWidth + 14

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={color}
        opacity={backgroundOpacity}
      />
      <rect
        x={x}
        y={y}
        height={height}
        rx={4}
        fill={color}
        width={visibleWidth}
      />
      <text
        x={valueX}
        y={y + height / 2}
        fill={valueFitsInside ? labelInk(color) : INK.secondary}
        fontSize={13}
        fontWeight={700}
        textAnchor={valueFitsInside ? "middle" : "start"}
        dominantBaseline="central"
        paintOrder="stroke"
        stroke={valueFitsInside ? color : INK.surface}
        strokeWidth={valueFitsInside ? 2 : 3}
        strokeLinejoin="round"
        opacity={shownValue > 0 && visibleWidth > 0 ? 1 : 0}
        style={{ pointerEvents: "none" }}
      >
        {shownValue}
      </text>
      <text
        x={x + visibleWidth + percentageOffset}
        y={y + height / 2}
        fill={INK.secondary}
        fontSize={13}
        fontWeight={600}
        dominantBaseline="central"
        opacity={percentageOpacity}
        style={{ pointerEvents: "none" }}
      >
        {percentage(selected, total)}%
      </text>
    </g>
  )
}

function VerticalPowerBar({ props }: { props: ShapeProps }) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Math.max(0, Number(props.width ?? 0))
  const height = Math.max(0, Number(props.height ?? 0))
  const color = props.fill ?? SERIES
  const seriesKey = String(props.dataKey ?? "value")
  const row = props.payload
  const total = Number(row?.[seriesKey] ?? 0)
  const selected = row?.__highlights[seriesKey] ?? 0
  const highlighting = Boolean(row?.__highlighting)
  const wasHighlighting = Boolean(row?.__from?.highlighting)
  const previousSelected = row?.__from?.highlights[seriesKey] ?? 0
  const progress = shapeProgress(props)
  const targetRatio = highlighting ? ratio(selected, total) : 1
  const startRatio = row?.__from ? fromRatio(row, seriesKey, total) : targetRatio
  const visibleHeight = height * interpolate(startRatio, targetRatio, progress)
  const visibleTop = y + height - visibleHeight
  const visibleValue = highlighting ? selected : total
  const fromValue = row?.__from ? (wasHighlighting ? previousSelected : total) : 0
  const shownValue = Math.round(interpolate(fromValue, visibleValue, progress))
  const backgroundOpacity = interpolate(wasHighlighting ? 0.16 : 0, highlighting ? 0.16 : 0, progress)
  const percentageOpacity = interpolate(
    wasHighlighting && previousSelected > 0 ? 1 : 0,
    highlighting && total > 0 && selected > 0 ? 1 : 0,
    progress,
  )

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={color}
        opacity={backgroundOpacity}
      />
      <rect
        x={x}
        y={visibleTop}
        width={width}
        rx={4}
        fill={color}
        height={visibleHeight}
      />
      <text
        x={x + width / 2}
        y={visibleTop + visibleHeight / 2}
        fill={labelInk(color)}
        fontSize={12}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
        paintOrder="stroke"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        opacity={shownValue > 0 && visibleHeight > 0 ? 1 : 0}
        style={{ pointerEvents: "none" }}
      >
        {shownValue}
      </text>
      <text
        x={x + width / 2}
        y={visibleTop - 6}
        fill={INK.secondary}
        fontSize={12}
        fontWeight={600}
        textAnchor="middle"
        opacity={percentageOpacity}
        style={{ pointerEvents: "none" }}
      >
        {percentage(selected, total)}%
      </text>
    </g>
  )
}

/**
 * Os renderizadores de forma ficam no módulo, e não em arrows dentro do JSX.
 * Uma função estável preserva o histórico do motor nativo do Recharts entre
 * renders. Série e cor vêm de `dataKey`/`fill`, já entregues à forma.
 */
const renderHorizontalBar = (props: unknown) => <HorizontalPowerBar props={props as ShapeProps} />
const renderVerticalBar = (props: unknown) => <VerticalPowerBar props={props as ShapeProps} />
const renderDonutSector = (props: unknown) => <DonutPowerSector props={props as AnimatedPieSectorProps} />

/** Ranking horizontal com o total apagado e a parcela selecionada por cima. */
export function RankingBars({
  animationKey,
  data,
  highlightData = null,
  height = 280,
  labelWidth = 150,
  measure,
  selectedLabel = null,
  onSelect,
  collapsedLimit,
}: {
  animationKey: string
  data: LabelValue[]
  highlightData?: LabelValue[] | null
  height?: number
  labelWidth?: number
  /** O que o número conta ("RAPs", "coletas"), para o tooltip não mostrar um valor solto. */
  measure?: string
  selectedLabel?: string | null
  onSelect?: (label: string) => void
  collapsedLimit?: number
}) {
  const expanded = useChartExpanded()
  const series = useSeriesColor()
  const visibleData = !expanded && collapsedLimit ? data.slice(0, collapsedLimit) : data
  const visibleLabels = new Set(visibleData.map((row) => row.label))
  const visibleHighlight = highlightData?.filter((row) => visibleLabels.has(row.label)) ?? null
  const mergedRows = mergeLabelRows(visibleData, visibleHighlight)
  const animate = useChartAnimation(animationKey, JSON.stringify(data), rowsSignature(mergedRows))
  const rows = useHighlightTransition(mergedRows)
  if (!data.length) return <Empty height={height} />

  return (
    <PowerChart
      height={height}
      selected={selectedLabel ?? undefined}
      interactive={Boolean(onSelect)}
    >
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
        barCategoryGap="12%"
        onClick={onSelect ? (state) => {
          const index = selectedIndex(state.activeTooltipIndex)
          if (index !== null && visibleData[index]) onSelect(visibleData[index].label)
        } : undefined}
      >
        <CartesianGrid horizontal={false} stroke={INK.grid} />
        <XAxis type="number" allowDecimals={false} axisLine={{ stroke: INK.axis }} {...axisProps} />
        <YAxis
          type="category"
          dataKey="label"
          width={labelWidth}
          interval={0}
          axisLine={false}
          {...axisProps}
          tick={{ fill: INK.secondary, fontSize: 14 }}
        />
        <Tooltip content={<ChartTooltip measure={measure} />} cursor={{ fill: "var(--chart-cursor)" }} />
        <Bar
          dataKey="value"
          fill={series}
          radius={RADIUS_BAR}
          maxBarSize={adaptiveBarSize(visibleData.length)}
          isAnimationActive={animate}
          animationDuration={ANIMATION_DURATION}
          animationEasing="ease-out"
          shape={renderHorizontalBar}
        />
      </BarChart>
    </PowerChart>
  )
}

/**
 * Teto da meta configurada na engrenagem. A leitura é "tem que ficar abaixo
 * desta linha", então ela é vermelha e traz o número escrito: sem o rótulo, o
 * tracejado seria só mais uma linha de grade. `extendDomain` garante que uma
 * meta acima do maior mês ainda apareça, em vez de sair pelo topo.
 *
 * É função, e não componente: o Recharts identifica os filhos do gráfico pelo
 * tipo do elemento, e um invólucro próprio não seria reconhecido como uma
 * `ReferenceLine`.
 */
function targetLine(target: number | null | undefined) {
  if (typeof target !== "number" || target <= 0) return null

  return (
    <ReferenceLine
      y={target}
      stroke={STATUS.critical}
      // Pontilhado, e não tracejado: na Evolução mensal a reta da tendência já é
      // um tracejado vermelho, e duas linhas do mesmo traço se confundiriam. A
      // meta é um limite, não uma medição - o ponteado diz isso sozinho.
      strokeDasharray="2 5"
      strokeLinecap="round"
      strokeWidth={2}
      ifOverflow="extendDomain"
      label={{
        value: `Meta: máx. ${target}`,
        position: "insideTopRight",
        fill: STATUS.critical,
        fontSize: 13,
        fontWeight: 600,
      }}
    />
  )
}

function isOverTarget(value: unknown, target: number | null | undefined): boolean {
  return typeof target === "number" && target > 0 && Number(value ?? 0) > target
}

/** Evolução mensal com preenchimento vertical proporcional ao destaque. */
export function TrendColumns({ animationKey, data, highlightData = null, height = 260, measure, selectedPeriod = null, onSelect, compact = false, target = null }: {
  animationKey: string
  data: PeriodValue[]
  highlightData?: PeriodValue[] | null
  height?: number
  measure?: string
  selectedPeriod?: string | null
  onSelect?: (period: string) => void
  compact?: boolean
  /** Teto de RAPs no mês: a coluna que passar dele vira vermelha. */
  target?: number | null
}) {
  const series = useSeriesColor()
  const mergedRows = mergePeriodRows(data, highlightData)
  const animate = useChartAnimation(animationKey, JSON.stringify(data), rowsSignature(mergedRows))
  const rows = useHighlightTransition(mergedRows)
  if (!data.length) return <Empty height={height} />

  return (
    <PowerChart
      height={height}
      selected={selectedPeriod ?? undefined}
      interactive={Boolean(onSelect)}
      className={compact ? "mx-auto max-w-[1120px]" : undefined}
    >
      <BarChart
        data={rows}
        margin={{ top: 28, right: 8, bottom: 4, left: 0 }}
        barCategoryGap={VERTICAL_CATEGORY_INSET}
        onClick={onSelect ? (state) => {
          const index = selectedIndex(state.activeTooltipIndex)
          if (index !== null && data[index]) onSelect(data[index].period)
        } : undefined}
      >
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="label" axisLine={{ stroke: INK.axis }} {...axisProps} />
        <YAxis width={32} axisLine={false} allowDecimals={false} {...axisProps} />
        <Tooltip content={<ChartTooltip measure={measure} />} cursor={{ fill: "var(--chart-cursor)" }} />
        {targetLine(target)}
        <Bar
          dataKey="value"
          fill={series}
          radius={RADIUS_COLUMN}
          isAnimationActive={animate}
          animationDuration={ANIMATION_DURATION}
          animationEasing="ease-out"
          shape={renderVerticalBar}
        >
          {/* A cor do mês estourado não é decoração: é a resposta da meta. A
              forma customizada já pinta pelo `fill` que recebe, então a célula
              basta. */}
          {rows.map((row, index) => (
            <Cell key={row.label ?? index} fill={isOverTarget(row.value, target) ? STATUS.critical : series} />
          ))}
        </Bar>
      </BarChart>
    </PowerChart>
  )
}

/** Linha total apagada, o subconjunto na cor da aba e a reta tracejada da tendência. */
export function TrendLine({ animationKey, data, highlightData = null, height = 260, measure, selectedPeriod = null, onSelect, target = null }: {
  animationKey: string
  data: PeriodValue[]
  highlightData?: PeriodValue[] | null
  height?: number
  measure?: string
  selectedPeriod?: string | null
  onSelect?: (period: string) => void
  /** Teto de RAPs no mês, desenhado como linha tracejada. */
  target?: number | null
}) {
  const series = useSeriesColor()
  const highlighting = highlightData !== null
  const merged = mergePeriodRows(data, highlightData)
  const plotted = merged.map((row) => (highlighting ? row.highlightValue : row.value) as number | null)
  // A tendência segue a série que está colorida na tela: o total do filtro, ou a
  // parcela do barracão/colaborador escolhido enquanto o recorte estiver ativo.
  const trend = linearTrend(plotted)
  const visualRows = merged.map((row, index) => ({
    ...row,
    animatedValue: plotted[index],
    trend: trend?.[index] ?? null,
  }))
  const animate = useChartAnimation(animationKey, JSON.stringify(data), rowsSignature(visualRows))
  const rows = useHighlightTransition(visualRows)
  if (!data.length) return <Empty height={height} />

  // Rótulo só na ponta da reta: o nome da marca é dito uma vez, não em todo mês.
  const lastIndex = rows.length - 1
  const renderTrendLabel = (props: { x?: string | number; y?: string | number; index?: number }) => (
    props.index === lastIndex ? (
      <text
        x={Number(props.x ?? 0) + 9}
        y={Number(props.y ?? 0)}
        fill={INK.muted}
        fontSize={13}
        fontWeight={600}
        dominantBaseline="central"
      >
        Tendência
      </text>
    ) : <text />
  )

  return (
    <PowerChart height={height} selected={selectedPeriod ?? undefined} interactive={Boolean(onSelect)}>
      <LineChart
        data={rows}
        margin={{ top: 12, right: trend ? 74 : 16, bottom: 4, left: 0 }}
        onClick={onSelect ? (state) => {
          const index = selectedIndex(state.activeTooltipIndex)
          if (index !== null && data[index]) onSelect(data[index].period)
        } : undefined}
      >
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="label" axisLine={{ stroke: INK.axis }} {...axisProps} />
        <YAxis width={32} axisLine={false} {...axisProps} />
        <Tooltip content={<ChartTooltip measure={measure} />} cursor={{ stroke: INK.axis }} />
        {targetLine(target)}
        <Line
          type="monotone"
          dataKey="value"
          stroke={INK.axis}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={highlighting ? 0.28 : 0}
          isAnimationActive={false}
          dot={highlighting ? { r: 4, fill: INK.axis, fillOpacity: 0.28, stroke: INK.surface, strokeWidth: 2 } : false}
          activeDot={false}
        />
        <Line
          type="monotone"
          dataKey="animatedValue"
          stroke={series}
          strokeWidth={highlighting ? 3 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          connectNulls={false}
          tooltipType="none"
          isAnimationActive={animate}
          animationDuration={ANIMATION_DURATION}
          animationEasing="ease-out"
          dot={{ r: highlighting ? 5 : 4, fill: series, stroke: INK.surface, strokeWidth: 2 }}
          activeDot={false}
        />
        {/* Reta reta e tracejada, sem pontos: nada nela é uma medição, é a direção
            do período inteiro. O nome fica na ponta em vez de numa legenda - a
            legenda encolheria a área de plotagem e o gráfico saltaria a cada
            clique, já que as marcas visíveis mudam com o recorte. */}
        {trend && (
          <Line
            dataKey="trend"
            stroke={series}
            strokeWidth={2}
            strokeOpacity={0.8}
            strokeDasharray="7 5"
            dot={false}
            activeDot={false}
            tooltipType="none"
            isAnimationActive={false}
            label={renderTrendLabel}
          />
        )}
      </LineChart>
    </PowerChart>
  )
}

/** Gates por período com cada coluna dividida visualmente entre total e seleção. */
export function GateColumns({
  animationKey,
  data,
  highlightData = null,
  gates,
  height = 280,
  measure,
  selectedGate = null,
  selectedPeriod = null,
  onSelect,
}: {
  animationKey: string
  data: GateValue[]
  highlightData?: GateValue[] | null
  gates: string[]
  height?: number
  measure?: string
  selectedGate?: string | null
  selectedPeriod?: string | null
  onSelect?: (gate: string, period: string) => void
}) {
  const periods = [...new Set(data.map((row) => row.label))]
  const mergedRows = periods.map((label) => {
    const period = data.find((row) => row.label === label)?.period ?? ""
    const entry: HighlightRow = {
      label,
      period,
      __highlighting: highlightData !== null,
      __highlights: {},
    }
    for (const gate of gates) {
      entry[gate] = data.find((row) => row.label === label && row.gate === gate)?.value ?? 0
      entry.__highlights[gate] = highlightData?.find((row) => row.period === period && row.gate === gate)?.value ?? 0
    }
    return entry
  })
  const animate = useChartAnimation(
    animationKey,
    JSON.stringify([data, gates]),
    rowsSignature(mergedRows),
  )
  const rows = useHighlightTransition(mergedRows)
  if (!data.length) return <Empty height={height} />

  return (
    <PowerChart height={height} selected={`${selectedGate ?? ""}:${selectedPeriod ?? ""}`} interactive={Boolean(onSelect)}>
      <BarChart
        data={rows}
        margin={{ top: 28, right: 8, bottom: 4, left: 0 }}
        barGap={VERTICAL_BAR_GAP}
        barCategoryGap={VERTICAL_CATEGORY_INSET}
      >
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="label" axisLine={{ stroke: INK.axis }} {...axisProps} />
        <YAxis width={32} axisLine={false} {...axisProps} />
        <Tooltip content={<ChartTooltip measure={measure} />} cursor={{ fill: "var(--chart-cursor)" }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 14, paddingTop: 8 }}
          formatter={(value: string) => <span style={{ color: INK.secondary }}>{value}</span>}
        />
        {gates.map((gate, index) => {
          const color = CATEGORICAL[index % CATEGORICAL.length]
          return (
            <Bar
              key={gate}
              dataKey={gate}
              fill={color}
              radius={RADIUS_COLUMN}
              isAnimationActive={animate}
              animationDuration={ANIMATION_DURATION}
              animationEasing="ease-out"
              shape={renderVerticalBar}
              // Alvo invisível da altura do gráfico, uma faixa por gate. Sem ele o
              // clique dependeria de acertar uma coluna de 22px - e um gate zerado
              // no mês não teria coluna nenhuma para acertar. Os outros visuais
              // aceitam o clique em qualquer ponto da faixa do mês; aqui a faixa
              // precisa ser por gate, que é o dado que falta ao clique do gráfico.
              background={onSelect ? { fill: "transparent" } : undefined}
              // O clique fica na marca, e não no gráfico: só aqui se sabe qual gate
              // foi tocado. No clique do BarChart o Recharts entrega `activeDataKey`
              // vazio - com tooltip por eixo, ele nem chega a ser preenchido.
              onClick={onSelect ? (entry: unknown) => {
                const row = (entry as { payload?: HighlightRow }).payload
                const period = String(row?.period ?? "")
                if (period) onSelect(gate, period)
              } : undefined}
            />
          )
        })}
      </BarChart>
    </PowerChart>
  )
}

/**
 * Fatia da rosca no mesmo padrão das barras: o trilho apagado guarda o total e
 * uma cópia sólida cresce do anel interno até a espessura da parcela selecionada.
 * O recorte é feito por um círculo animado - assim a fatia preenche sem que o
 * gráfico precise de um segundo `<Pie>` sobreposto.
 */
function DonutPowerSector({ props }: { props: AnimatedPieSectorProps }) {
  const clipId = useId().replace(/:/g, "")
  const row = props.payload as HighlightRow | undefined
  const total = Number(props.value ?? 0)
  const selected = row?.__highlights.value ?? 0
  const highlighting = Boolean(row?.__highlighting)
  const wasHighlighting = Boolean(row?.__from?.highlighting)
  const inner = Number(props.innerRadius ?? 0)
  const outer = Number(props.outerRadius ?? 0)
  const thickness = (fraction: number) => inner + (outer - inner) * fraction
  const progress = shapeProgress(props)
  const targetFilled = highlighting ? thickness(ratio(selected, total)) : outer
  const fromFilled = thickness(fromRatio(row, "value", total))
  const filled = interpolate(fromFilled, targetFilled, progress)
  const opacity = interpolate(wasHighlighting ? 0.16 : 1, highlighting ? 0.16 : 1, progress)

  return (
    <g>
      <g opacity={opacity}>
        <Sector {...props} stroke="none" />
      </g>
      <clipPath id={clipId}>
        <circle
          cx={props.cx}
          cy={props.cy}
          r={filled}
        />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <Sector {...props} stroke="none" />
      </g>
      {/* O vão branco entre as fatias fica por cima, igual nos dois estados. */}
      <Sector {...props} fill="none" />
    </g>
  )
}

/** Rosca: a espessura colorida de cada fatia representa a porcentagem selecionada. */
export function ShareDonut({
  animationKey,
  data,
  highlightData = null,
  height = 260,
  measure,
  selectedLabel = null,
  centerLabel,
  showValues = false,
  colorMap,
  onSelect,
}: {
  animationKey: string
  data: LabelValue[]
  highlightData?: LabelValue[] | null
  height?: number
  measure?: string
  selectedLabel?: string | null
  centerLabel?: string
  showValues?: boolean
  colorMap?: Readonly<Record<string, string>>
  onSelect?: (label: string) => void
}) {
  const mergedRows = mergeLabelRows(data, highlightData)
  const animate = useChartAnimation(animationKey, JSON.stringify(data), rowsSignature(mergedRows))
  const rows = useHighlightTransition(mergedRows)
  if (!data.length) return <Empty height={height} />

  const total = data.reduce((sum, row) => sum + row.value, 0)
  const highlighting = highlightData !== null

  return (
    <PowerChart
      height={height}
      selected={selectedLabel ?? undefined}
      interactive={Boolean(onSelect)}
      className={showValues ? "quality-donut-detailed" : undefined}
    >
      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Tooltip content={<ChartTooltip measure={measure} />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 14, paddingTop: 8 }}
          formatter={(value: string) => <span style={{ color: INK.secondary }}>{value}</span>}
        />
        <Pie
          data={rows}
          dataKey="value"
          nameKey="label"
          innerRadius={showValues ? "44%" : "52%"}
          outerRadius={showValues ? "68%" : "80%"}
          paddingAngle={2}
          stroke={INK.surface}
          strokeWidth={2}
          label={(props: {
            cx?: number | string
            cy?: number | string
            midAngle?: number
            outerRadius?: number | string
            value?: number
            payload?: HighlightRow
          }) => {
            const cx = Number(props.cx ?? 0)
            const cy = Number(props.cy ?? 0)
            const value = Number(props.value ?? 0)
            const row = props.payload
            if (total <= 0 || !row) return <text />
            const radian = Math.PI / 180
            const radius = Number(props.outerRadius ?? 0) + 18
            const x = cx + radius * Math.cos(-(props.midAngle ?? 0) * radian)
            const y = cy + radius * Math.sin(-(props.midAngle ?? 0) * radian)
            const selected = row.__highlights.value ?? 0
            const text = highlighting
              ? selected > 0
                ? showValues
                  ? `${selected} (${detailedPercentage(selected, value)}%)`
                  : `${selected} · ${percentage(selected, value)}%`
                : ""
              : showValues
                ? `${value} (${detailedPercentage(value, total)}%)`
                : `${Math.round((value / total) * 100)}%`

            return (
              <text className={showValues ? "quality-donut-detail-label" : undefined} x={x} y={y} fill={INK.secondary} fontSize={13} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
                {text}
              </text>
            )
          }}
          labelLine={showValues ? { stroke: INK.muted, strokeWidth: 1 } : false}
          isAnimationActive={animate}
          animationDuration={ANIMATION_DURATION}
          animationEasing="ease-out"
          shape={renderDonutSector}
          onClick={onSelect ? (entry) => {
            const row = entry.payload as HighlightRow | undefined
            if (row) onSelect(row.label)
          } : undefined}
        >
          {rows.map((row, index) => (
            <Cell
              key={row.label}
              fill={colorMap?.[row.label] ?? CATEGORICAL[index % CATEGORICAL.length]}
              stroke={INK.surface}
              strokeWidth={2}
            />
          ))}
        </Pie>
        {centerLabel && (
          <g className="pointer-events-none">
            <text x="50%" y="43%" textAnchor="middle" dominantBaseline="central" fill={INK.primary} fontSize={30} fontWeight={700}>
              {total}
            </text>
            <text x="50%" y="53%" textAnchor="middle" dominantBaseline="central" fill={INK.secondary} fontSize={14}>
              {centerLabel}
            </text>
          </g>
        )}
      </PieChart>
    </PowerChart>
  )
}

/** Coletas e reclamações com parcelas selecionadas sobre os totais mensais. */
export function DispatchVsComplaints({
  animationKey,
  dispatches,
  complaints,
  highlightDispatches = null,
  highlightComplaints = null,
  height = 280,
  selectedPeriod = null,
  onSelect,
}: {
  animationKey: string
  dispatches: PeriodValue[]
  complaints: PeriodValue[]
  highlightDispatches?: PeriodValue[] | null
  highlightComplaints?: PeriodValue[] | null
  height?: number
  selectedPeriod?: string | null
  onSelect?: (period: string) => void
}) {
  const series = useSeriesColor()
  const highlighting = highlightDispatches !== null || highlightComplaints !== null
  const mergedRows: HighlightRow[] = dispatches.map((row) => ({
    period: row.period,
    label: row.label,
    Coletas: row.value,
    Reclamações: complaints.find((entry) => entry.period === row.period)?.value ?? 0,
    __highlighting: highlighting,
    __highlights: {
      Coletas: highlightDispatches?.find((entry) => entry.period === row.period)?.value ?? 0,
      Reclamações: highlightComplaints?.find((entry) => entry.period === row.period)?.value ?? 0,
    },
  }))
  const animate = useChartAnimation(
    animationKey,
    JSON.stringify([dispatches, complaints]),
    rowsSignature(mergedRows),
  )
  const rows = useHighlightTransition(mergedRows)
  if (!dispatches.length) return <Empty height={height} />

  return (
    <PowerChart height={height} selected={selectedPeriod ?? undefined} interactive={Boolean(onSelect)}>
      <BarChart
        data={rows}
        margin={{ top: 28, right: 8, bottom: 4, left: 0 }}
        barGap={VERTICAL_BAR_GAP}
        barCategoryGap={VERTICAL_CATEGORY_INSET}
        onClick={onSelect ? (state) => {
          const index = selectedIndex(state.activeTooltipIndex)
          if (index !== null && rows[index]) onSelect(String(rows[index].period))
        } : undefined}
      >
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="label" axisLine={{ stroke: INK.axis }} {...axisProps} />
        <YAxis width={32} axisLine={false} {...axisProps} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--chart-cursor)" }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 14, paddingTop: 8 }}
          formatter={(value: string) => <span style={{ color: INK.secondary }}>{value}</span>}
        />
        <Bar
          dataKey="Coletas"
          fill={series}
          radius={RADIUS_COLUMN}
          isAnimationActive={animate}
          animationDuration={ANIMATION_DURATION}
          animationEasing="ease-out"
          shape={renderVerticalBar}
        />
        {/* A reclamação segue no vermelho da marca em qualquer aba: aqui a cor
            está dizendo que o registro é ruim, e não de que seção ele veio. */}
        <Bar
          dataKey="Reclamações"
          fill={SERIES}
          radius={RADIUS_COLUMN}
          isAnimationActive={animate}
          animationDuration={ANIMATION_DURATION}
          animationEasing="ease-out"
          shape={renderVerticalBar}
        />
      </BarChart>
    </PowerChart>
  )
}
