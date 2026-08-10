import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { GateValue, LabelValue, PeriodValue } from "@/pages/quality/types"
import { BAR_SIZE, CATEGORICAL, INK, RADIUS_BAR, RADIUS_COLUMN, SERIES, axisProps } from "./tokens"

/** Aviso curto no lugar do gráfico quando o filtro não devolve nada. */
function Empty({ height }: { height: number }) {
  return (
    <div className="grid place-items-center text-sm text-[#898781]" style={{ height }}>
      Nenhum registro para os filtros escolhidos.
    </div>
  )
}

/** Balão de leitura: identidade vem do ponto colorido, o texto fica em tinta neutra. */
function ChartTooltip({ active, payload, label, unit = "" }: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[]
  label?: string | number
  unit?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-[#0b0b0b]">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="mt-1 flex items-center gap-1.5 text-[#52514e]">
          <span className="size-2 shrink-0 rounded-full" style={{ background: entry.color }} aria-hidden="true" />
          {entry.name && entry.name !== "value" ? `${entry.name}: ` : ""}
          <span className="font-semibold text-[#0b0b0b]">{entry.value}</span>
          {unit}
        </p>
      ))}
    </div>
  )
}

/**
 * Ranking horizontal de uma única série: uma cor só para todas as barras, com o
 * valor na ponta no lugar do eixo de valores.
 */
export function RankingBars({ data, height = 280, labelWidth = 150 }: {
  data: LabelValue[]
  height?: number
  labelWidth?: number
}) {
  if (!data.length) return <Empty height={height} />

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap="22%">
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={labelWidth}
          axisLine={false}
          {...axisProps}
          tick={{ fill: INK.secondary, fontSize: 12 }}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
        <Bar dataKey="value" fill={SERIES} radius={RADIUS_BAR} maxBarSize={BAR_SIZE} isAnimationActive={false}>
          <LabelList dataKey="value" position="right" fill={INK.secondary} fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Evolução mensal de uma série, com o valor na tampa de cada coluna. */
export function TrendColumns({ data, height = 260 }: { data: PeriodValue[]; height?: number }) {
  if (!data.length) return <Empty height={height} />

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 24, right: 8, bottom: 4, left: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="label" axisLine={{ stroke: INK.axis }} {...axisProps} />
        <YAxis hide />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
        <Bar dataKey="value" fill={SERIES} radius={RADIUS_COLUMN} maxBarSize={BAR_SIZE} isAnimationActive={false}>
          <LabelList dataKey="value" position="top" fill={INK.secondary} fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Linha de 2px com marcadores de 8px para a evolução no tempo. */
export function TrendLine({ data, height = 260 }: { data: PeriodValue[]; height?: number }) {
  if (!data.length) return <Empty height={height} />

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="label" axisLine={{ stroke: INK.axis }} {...axisProps} />
        <YAxis width={32} axisLine={false} {...axisProps} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: INK.axis }} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={SERIES}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          isAnimationActive={false}
          dot={{ r: 4, fill: SERIES, stroke: INK.surface, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: SERIES, stroke: INK.surface, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/**
 * Gates ao longo dos meses. A cor segue o gate, não a posição: filtrar um gate
 * não repinta os que sobraram.
 */
export function GateColumns({ data, gates, height = 280 }: {
  data: GateValue[]
  gates: string[]
  height?: number
}) {
  if (!data.length) return <Empty height={height} />

  const periods = [...new Set(data.map((row) => row.label))]
  const rows = periods.map((label) => {
    const entry: Record<string, string | number> = { label }
    for (const gate of gates) {
      entry[gate] = data.find((row) => row.label === label && row.gate === gate)?.value ?? 0
    }
    return entry
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={2} barCategoryGap="24%">
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
        {gates.map((gate, index) => (
          <Bar
            key={gate}
            dataKey={gate}
            fill={CATEGORICAL[index % CATEGORICAL.length]}
            radius={RADIUS_COLUMN}
            maxBarSize={BAR_SIZE}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Rosca de participação por barracão: no máximo três fatias, com legenda. */
export function ShareDonut({ data, height = 260 }: { data: LabelValue[]; height?: number }) {
  if (!data.length) return <Empty height={height} />

  const total = data.reduce((sum, row) => sum + row.value, 0)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value: string) => <span style={{ color: INK.secondary }}>{value}</span>}
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="52%"
          outerRadius="80%"
          paddingAngle={2}
          stroke={INK.surface}
          strokeWidth={2}
          /* O rótulo é desenhado à mão para ficar em tinta neutra: só a fatia carrega a cor. */
          label={(props: {
            cx?: number | string
            cy?: number | string
            midAngle?: number
            outerRadius?: number | string
            value?: number
          }) => {
            const cx = Number(props.cx ?? 0)
            const cy = Number(props.cy ?? 0)
            const value = Number(props.value ?? 0)
            if (total <= 0) return <text />
            const radian = Math.PI / 180
            const radius = Number(props.outerRadius ?? 0) + 18
            const x = cx + radius * Math.cos(-(props.midAngle ?? 0) * radian)
            const y = cy + radius * Math.sin(-(props.midAngle ?? 0) * radian)

            return (
              <text
                x={x}
                y={y}
                fill={INK.secondary}
                fontSize={12}
                textAnchor={x > cx ? "start" : "end"}
                dominantBaseline="central"
              >
                {Math.round((value / total) * 100)}%
              </text>
            )
          }}
          labelLine={false}
          isAnimationActive={false}
        >
          {data.map((row, index) => (
            <Cell key={row.label} fill={CATEGORICAL[index % CATEGORICAL.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  )
}

/** Coletas e reclamações no mesmo eixo — mesma unidade, sem segundo eixo. */
export function DispatchVsComplaints({ dispatches, complaints, height = 280 }: {
  dispatches: PeriodValue[]
  complaints: PeriodValue[]
  height?: number
}) {
  if (!dispatches.length) return <Empty height={height} />

  const rows = dispatches.map((row) => ({
    label: row.label,
    Coletas: row.value,
    Reclamações: complaints.find((entry) => entry.period === row.period)?.value ?? 0,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={2} barCategoryGap="26%">
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
        <Bar dataKey="Coletas" fill={CATEGORICAL[1]} radius={RADIUS_COLUMN} maxBarSize={BAR_SIZE} isAnimationActive={false} />
        <Bar dataKey="Reclamações" fill={CATEGORICAL[0]} radius={RADIUS_COLUMN} maxBarSize={BAR_SIZE} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
