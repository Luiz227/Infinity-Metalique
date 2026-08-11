import { type ComponentProps, useId, useRef } from "react"
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
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { PieSectorShapeProps } from "recharts"

import { type ChartConfig, ChartContainer } from "@/components/ui/chart"
import { formatPeriod } from "@/pages/quality/format"
import type { GateValue, LabelValue, PeriodValue } from "@/pages/quality/types"
import { BAR_SIZE, CATEGORICAL, INK, RADIUS_BAR, RADIUS_COLUMN, SERIES, axisProps } from "./tokens"

const chartConfig = {
  total: { label: "Total", color: INK.axis },
  selected: { label: "Selecionado", color: SERIES },
} satisfies ChartConfig

const ANIMATION_DURATION = 580

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
 * O Recharts recria as marcas sempre que os dados mudam — o `AnimatedItems` usa
 * o id da animação como `key`, então guardar o nó do DOM não adianta. Em vez
 * disso guardamos o destaque anterior e o devolvemos junto da linha: a marca
 * nova nasce exatamente onde a antiga estava e anima dali até o valor novo.
 *
 * Duas coisas seguram a animação, e as duas dependem de o render que não mudou
 * nada não contar: o ponto de partida só gira quando o dado muda, e a saída
 * mantém a mesma identidade enquanto o dado é o mesmo — assim o Recharts não
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
    <div className="grid place-items-center text-sm text-[#898781]" style={{ height }}>
      Nenhum registro para os filtros escolhidos.
    </div>
  )
}

/**
 * Moldura comum dos visuais. A animação fica com o próprio Recharts, evitando
 * dois agendadores concorrentes atualizando os mesmos atributos do SVG.
 */
function PowerChart({ height, selected, interactive, children }: {
  height: number
  selected?: string
  interactive: boolean
  children: ComponentProps<typeof ChartContainer>["children"]
}) {
  return (
    <ChartContainer
      config={chartConfig}
      className={interactive ? "quality-interactive-chart" : undefined}
      style={{ height }}
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
 * por extenso, o modelo traz a linha de produto — e durante o cross-highlight o
 * valor vira parcela sobre o total.
 */
function ChartTooltip({ active, payload, label, measure = "", unit = "" }: {
  active?: boolean
  payload?: {
    name?: string
    dataKey?: string | number
    value?: number
    color?: string
    payload?: HighlightRow
  }[]
  label?: string | number
  measure?: string
  unit?: string
}) {
  if (!active || !payload?.length) return null
  const visible = payload.filter((entry) => entry.value !== undefined)

  // A rosca não tem eixo de categoria: o nome da fatia é que faz o título.
  const heading = label ?? visible[0]?.name ?? ""
  const suffix = measure ? ` ${measure}` : ""

  // Derivada aqui, e não injetada na linha: a linha é o que vai para o Recharts,
  // e marca recriada por mudança de dado volta ao `initial` do Motion — texto de
  // apresentação no array de dados custaria a animação do recorte.
  const first = visible[0]?.payload
  const description = typeof first?.description === "string" && first.description !== ""
    ? first.description
    : typeof first?.period === "string" ? formatPeriod(first.period) : ""

  return (
    <div className="min-w-32 max-w-72 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-[#0b0b0b]">{heading}</p>
      {description && <p className="mt-0.5 leading-snug text-[#52514e]">{description}</p>}
      {visible.map((entry, index) => {
        const row = entry.payload
        const key = String(entry.dataKey ?? entry.name ?? "value")
        const total = Number(entry.value ?? 0)
        const selected = row?.__highlights[key] ?? 0
        // Numa série só o campo se chama "value", que não diz nada; em gráfico de
        // várias séries o nome é o da série e precisa aparecer.
        const series = entry.name && entry.name !== "value" && entry.name !== heading ? entry.name : ""

        return (
          <div key={`${key}-${index}`} className="mt-1.5 flex items-start gap-1.5 text-[#52514e]">
            <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: entry.color }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              {series && <p>{series}</p>}
              {row?.__highlighting ? (
                <p className="font-semibold text-[#0b0b0b]">
                  {selected}{unit} de {total}{unit}{suffix} · {percentage(selected, total)}%
                </p>
              ) : (
                <p className="font-semibold text-[#0b0b0b]">{total}{unit}{suffix}</p>
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
        fill={valueFitsInside ? "#ffffff" : INK.secondary}
        fontSize={11}
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
        fontSize={11}
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
        fill="#ffffff"
        fontSize={10}
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
        fontSize={10}
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
  data,
  highlightData = null,
  height = 280,
  labelWidth = 150,
  measure,
  selectedLabel = null,
  onSelect,
}: {
  data: LabelValue[]
  highlightData?: LabelValue[] | null
  height?: number
  labelWidth?: number
  /** O que o número conta ("RAPs", "coletas"), para o tooltip não mostrar um valor solto. */
  measure?: string
  selectedLabel?: string | null
  onSelect?: (label: string) => void
}) {
  const rows = useHighlightTransition(mergeLabelRows(data, highlightData))
  if (!data.length) return <Empty height={height} />

  return (
    <PowerChart height={height} selected={selectedLabel ?? undefined} interactive={Boolean(onSelect)}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
        barCategoryGap="22%"
        onClick={onSelect ? (state) => {
          const index = selectedIndex(state.activeTooltipIndex)
          if (index !== null && data[index]) onSelect(data[index].label)
        } : undefined}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={labelWidth}
          interval={0}
          axisLine={false}
          {...axisProps}
          tick={{ fill: INK.secondary, fontSize: 12 }}
        />
        <Tooltip content={<ChartTooltip measure={measure} />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
        <Bar
          dataKey="value"
          fill={SERIES}
          radius={RADIUS_BAR}
          maxBarSize={BAR_SIZE}
          isAnimationActive
          animationDuration={ANIMATION_DURATION}
          animationEasing="ease-out"
          shape={renderHorizontalBar}
        />
      </BarChart>
    </PowerChart>
  )
}

/** Evolução mensal com preenchimento vertical proporcional ao destaque. */
export function TrendColumns({ data, highlightData = null, height = 260, measure, selectedPeriod = null, onSelect }: {
  data: PeriodValue[]
  highlightData?: PeriodValue[] | null
  height?: number
  measure?: string
  selectedPeriod?: string | null
  onSelect?: (period: string) => void
}) {
  const rows = useHighlightTransition(mergePeriodRows(data, highlightData))
  if (!data.length) return <Empty height={height} />

  return (
    <PowerChart height={height} selected={selectedPeriod ?? undefined} interactive={Boolean(onSelect)}>
      <BarChart
        data={rows}
        margin={{ top: 28, right: 8, bottom: 4, left: 0 }}
        barCategoryGap="28%"
        onClick={onSelect ? (state) => {
          const index = selectedIndex(state.activeTooltipIndex)
          if (index !== null && data[index]) onSelect(data[index].period)
        } : undefined}
      >
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="label" axisLine={{ stroke: INK.axis }} {...axisProps} />
        <YAxis hide />
        <Tooltip content={<ChartTooltip measure={measure} />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
        <Bar
          dataKey="value"
          fill={SERIES}
          radius={RADIUS_COLUMN}
          maxBarSize={BAR_SIZE}
          isAnimationActive
          animationDuration={ANIMATION_DURATION}
          animationEasing="ease-out"
          shape={renderVerticalBar}
        />
      </BarChart>
    </PowerChart>
  )
}

/** Linha total apagada e pontos/trechos do subconjunto em vermelho. */
export function TrendLine({ data, highlightData = null, height = 260, measure, selectedPeriod = null, onSelect }: {
  data: PeriodValue[]
  highlightData?: PeriodValue[] | null
  height?: number
  measure?: string
  selectedPeriod?: string | null
  onSelect?: (period: string) => void
}) {
  if (!data.length) return <Empty height={height} />
  const rows = mergePeriodRows(data, highlightData)
  const highlighting = highlightData !== null

  return (
    <PowerChart height={height} selected={selectedPeriod ?? undefined} interactive={Boolean(onSelect)}>
      <LineChart
        data={rows}
        margin={{ top: 12, right: 16, bottom: 4, left: 0 }}
        onClick={onSelect ? (state) => {
          const index = selectedIndex(state.activeTooltipIndex)
          if (index !== null && data[index]) onSelect(data[index].period)
        } : undefined}
      >
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="label" axisLine={{ stroke: INK.axis }} {...axisProps} />
        <YAxis width={32} axisLine={false} {...axisProps} />
        <Tooltip content={<ChartTooltip measure={measure} />} cursor={{ stroke: INK.axis }} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={highlighting ? INK.axis : SERIES}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          isAnimationActive
          animationDuration={450}
          animationEasing="ease-out"
          dot={{ r: 4, fill: highlighting ? INK.axis : SERIES, stroke: INK.surface, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: SERIES, stroke: INK.surface, strokeWidth: 2 }}
        />
        {highlighting && (
          <Line
            type="monotone"
            dataKey="highlightValue"
            stroke={SERIES}
            strokeWidth={3}
            connectNulls={false}
            tooltipType="none"
            isAnimationActive
            animationDuration={450}
            animationEasing="ease-out"
            dot={{ r: 5, fill: SERIES, stroke: INK.surface, strokeWidth: 2 }}
            activeDot={false}
          />
        )}
      </LineChart>
    </PowerChart>
  )
}

/** Gates por período com cada coluna dividida visualmente entre total e seleção. */
export function GateColumns({
  data,
  highlightData = null,
  gates,
  height = 280,
  measure,
  selectedGate = null,
  selectedPeriod = null,
  onSelect,
}: {
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
  const rows = useHighlightTransition(periods.map((label) => {
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
  }))
  if (!data.length) return <Empty height={height} />

  return (
    <PowerChart height={height} selected={`${selectedGate ?? ""}:${selectedPeriod ?? ""}`} interactive={Boolean(onSelect)}>
      <BarChart
        data={rows}
        margin={{ top: 28, right: 8, bottom: 4, left: 0 }}
        barGap={2}
        barCategoryGap="24%"
        onClick={onSelect ? (state) => {
          const index = selectedIndex(state.activeTooltipIndex)
          const gate = typeof state.activeDataKey === "string" ? state.activeDataKey : null
          const period = index === null ? null : String(rows[index]?.period ?? "")
          if (gate && gates.includes(gate) && period) onSelect(gate, period)
        } : undefined}
      >
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="label" axisLine={{ stroke: INK.axis }} {...axisProps} />
        <YAxis width={32} axisLine={false} {...axisProps} />
        <Tooltip content={<ChartTooltip measure={measure} />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
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
              maxBarSize={BAR_SIZE}
              isAnimationActive
              animationDuration={ANIMATION_DURATION}
              animationEasing="ease-out"
              shape={renderVerticalBar}
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
 * O recorte é feito por um círculo animado — assim a fatia preenche sem que o
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
export function ShareDonut({ data, highlightData = null, height = 260, measure, selectedLabel = null, onSelect }: {
  data: LabelValue[]
  highlightData?: LabelValue[] | null
  height?: number
  measure?: string
  selectedLabel?: string | null
  onSelect?: (label: string) => void
}) {
  const rows = useHighlightTransition(mergeLabelRows(data, highlightData))
  if (!data.length) return <Empty height={height} />

  const total = data.reduce((sum, row) => sum + row.value, 0)
  const highlighting = highlightData !== null

  return (
    <PowerChart height={height} selected={selectedLabel ?? undefined} interactive={Boolean(onSelect)}>
      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Tooltip content={<ChartTooltip measure={measure} />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value: string) => <span style={{ color: INK.secondary }}>{value}</span>}
        />
        <Pie
          data={rows}
          dataKey="value"
          nameKey="label"
          innerRadius="52%"
          outerRadius="80%"
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
              ? selected > 0 ? `${selected} · ${percentage(selected, value)}%` : ""
              : `${Math.round((value / total) * 100)}%`

            return (
              <text x={x} y={y} fill={INK.secondary} fontSize={11} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
                {text}
              </text>
            )
          }}
          labelLine={false}
          isAnimationActive
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
              fill={CATEGORICAL[index % CATEGORICAL.length]}
              stroke={INK.surface}
              strokeWidth={2}
            />
          ))}
        </Pie>
      </PieChart>
    </PowerChart>
  )
}

/** Coletas e reclamações com parcelas selecionadas sobre os totais mensais. */
export function DispatchVsComplaints({
  dispatches,
  complaints,
  highlightDispatches = null,
  highlightComplaints = null,
  height = 280,
  selectedPeriod = null,
  onSelect,
}: {
  dispatches: PeriodValue[]
  complaints: PeriodValue[]
  highlightDispatches?: PeriodValue[] | null
  highlightComplaints?: PeriodValue[] | null
  height?: number
  selectedPeriod?: string | null
  onSelect?: (period: string) => void
}) {
  const highlighting = highlightDispatches !== null || highlightComplaints !== null
  const rows = useHighlightTransition(dispatches.map((row) => ({
    period: row.period,
    label: row.label,
    Coletas: row.value,
    Reclamações: complaints.find((entry) => entry.period === row.period)?.value ?? 0,
    __highlighting: highlighting,
    __highlights: {
      Coletas: highlightDispatches?.find((entry) => entry.period === row.period)?.value ?? 0,
      Reclamações: highlightComplaints?.find((entry) => entry.period === row.period)?.value ?? 0,
    },
  })))
  if (!dispatches.length) return <Empty height={height} />

  return (
    <PowerChart height={height} selected={selectedPeriod ?? undefined} interactive={Boolean(onSelect)}>
      <BarChart
        data={rows}
        margin={{ top: 28, right: 8, bottom: 4, left: 0 }}
        barGap={2}
        barCategoryGap="26%"
        onClick={onSelect ? (state) => {
          const index = selectedIndex(state.activeTooltipIndex)
          if (index !== null && rows[index]) onSelect(String(rows[index].period))
        } : undefined}
      >
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="label" axisLine={{ stroke: INK.axis }} {...axisProps} />
        <YAxis width={32} axisLine={false} {...axisProps} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value: string) => <span style={{ color: INK.secondary }}>{value}</span>}
        />
        <Bar
          dataKey="Coletas"
          fill={CATEGORICAL[1]}
          radius={RADIUS_COLUMN}
          maxBarSize={BAR_SIZE}
          isAnimationActive
          animationDuration={ANIMATION_DURATION}
          animationEasing="ease-out"
          shape={renderVerticalBar}
        />
        <Bar
          dataKey="Reclamações"
          fill={CATEGORICAL[0]}
          radius={RADIUS_COLUMN}
          maxBarSize={BAR_SIZE}
          isAnimationActive
          animationDuration={ANIMATION_DURATION}
          animationEasing="ease-out"
          shape={renderVerticalBar}
        />
      </BarChart>
    </PowerChart>
  )
}
