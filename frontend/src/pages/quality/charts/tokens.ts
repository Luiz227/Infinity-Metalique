/**
 * Tokens de visualização da qualidade.
 *
 * A paleta categórica foi validada em modo claro sobre a superfície branca dos
 * cartões (`validate_palette.js`, --pairs all): banda de luminosidade, piso de
 * croma, separação para daltonismo (pior par ΔE 13,0 deutan) e contraste - os
 * três slots ficam acima de 3:1. O app não tem tema escuro, então só o modo
 * claro é definido aqui.
 */

/** Cor única das séries de magnitude: uma barra por categoria, sempre o vermelho da marca. */
export const SERIES = "#db0f0f"

/** Slots categóricos, atribuídos em ordem fixa e nunca reciclados. */
export const CATEGORICAL = ["#db0f0f", "#2a78d6", "#4a3aa7"] as const

/** Cor estável de cada causa. O código conserva a mesma cor mesmo após filtros
 * mudarem a ordem das fatias ou ocultarem categorias sem registros. */
export const CODE_COLORS: Readonly<Record<string, string>> = {
  "COD 1": "#2a78d6",
  "COD 2": "#008f7a",
  "COD 3": "#3f8f3a",
  "COD 4": "#b77900",
  "COD 5": "#db0f0f",
  "COD 6": "#7c3aa7",
  "COD 7": "#c23b75",
  "COD 8": "#e66717",
  "COD 9": "#167c80",
  "COD 10": "#6b7280",
}

/** Cores de estado, usadas só onde a cor significa bom/ruim - sempre com rótulo. */
export const STATUS = { good: "#0ca30c", critical: "#d03b3b" } as const

export const INK = {
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  surface: "#ffffff",
}

/** Especificações fixas das marcas: barra fina, ponta arredondada, base reta. */
export const BAR_SIZE = 22
export const RADIUS_COLUMN: [number, number, number, number] = [4, 4, 0, 0]
export const RADIUS_BAR: [number, number, number, number] = [0, 4, 4, 0]

/** Eixos e grade em hairline sólido, um passo abaixo da superfície. */
export const axisProps = {
  stroke: INK.axis,
  tickLine: false,
  tick: { fill: INK.muted, fontSize: 12 },
} as const
