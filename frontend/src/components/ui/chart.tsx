import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

const THEMES = { light: "", dark: ".dark" } as const
const INITIAL_DIMENSION = { width: 320, height: 200 } as const

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
>

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null)

/**
 * Container shadcn para Recharts v3: injeta tokens de série, oferece a medida
 * inicial exigida pelo ResponsiveContainer e mantém o SVG responsivo.
 */
export function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
  initialDimension?: { width: number; height: number }
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex w-full min-w-0 justify-center text-xs [&_.recharts-layer]:outline-none [&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer initialDimension={initialDimension}>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colors = Object.entries(config).filter(([, item]) => item.theme ?? item.color)
  if (!colors.length) return null

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES).map(([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colors.map(([key, item]) => {
  const color = item.theme?.[theme as keyof typeof item.theme] ?? item.color
  return color ? `  --color-${key}: ${color};` : null
}).join("\n")}
}
`).join("\n"),
      }}
    />
  )
}
