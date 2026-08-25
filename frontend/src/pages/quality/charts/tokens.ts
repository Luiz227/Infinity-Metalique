/**
 * Tokens de visualização da qualidade.
 *
 * A paleta categórica foi validada em modo claro sobre a superfície branca dos
 * cartões (`validate_palette.js`, --pairs all): banda de luminosidade, piso de
 * croma, separação para daltonismo (pior par ΔE 13,0 deutan) e contraste - os
 * três slots ficam acima de 3:1. A escala de tinta usa variáveis CSS para
 * acompanhar o tema; as cores que representam dados continuam estáveis.
 */

/** Cor única das séries de magnitude: uma barra por categoria, sempre o vermelho da marca. */
export const SERIES = "#db0f0f"

/**
 * Cor da série de magnitude por aba da qualidade. A cor identifica a seção, e não
 * uma categoria dentro do gráfico: nenhuma delas divide o mesmo visual com outra,
 * então não há par a separar aqui. Chaves são os ids de `TABS` no QualityPage -
 * lidas como texto para o token não depender da view. Abas sem entrada (Unidades,
 * Planos de ação, Registros) e o Dashboard ficam com o vermelho da marca.
 */
export const SECTION_SERIES: Readonly<Record<string, string>> = {
  raps: "#ec7171",
  produtos: "#f47853",
  coletas: "#fdc543",
  colaboradores: "#6ed0bf",
  qualidade: "#409c8e",
}

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

/**
 * A escala de cinza do projeto, espelhando os tokens --color-ink* de global.css:
 * gráfico e interface escrevem com a mesma tinta.
 *
 * `muted` pinta texto de 11px (o rótulo "Tendência") sobre a superfície branca,
 * então precisa dos 4,5:1 da WCAG - o #898781 anterior dava 3,59:1. `grid` e
 * `axis` continuam claros de propósito: são traço, não texto, e a linha de
 * grade tem de ficar atrás do dado, não competir com ele.
 */
export const INK = {
  primary: "var(--chart-ink-primary)",
  secondary: "var(--chart-ink-secondary)",
  muted: "var(--chart-ink-muted)",
  grid: "var(--chart-ink-grid)",
  axis: "var(--chart-ink-axis)",
  surface: "var(--chart-surface)",
}

/**
 * Tinta do número escrito dentro da marca. O branco só se sustenta sobre as cores
 * escuras: no #db0f0f ele dá 5,1:1, mas no amarelo das coletas cai para 1,6:1 e o
 * número some. O corte em 0,22 de luminância relativa é o ponto em que a tinta
 * escura passa a render mais contraste que o branco.
 */
export function labelInk(color: string): string {
  return relativeLuminance(color) < 0.22 ? "#ffffff" : "#0b0b0b"
}

/** Luminância relativa da WCAG, para um hexadecimal de seis dígitos. */
function relativeLuminance(color: string): number {
  const channel = (start: number) => {
    const value = parseInt(color.slice(start, start + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
  }

  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** Base para gráficos densos; com poucos itens o teto cresce de forma adaptativa. */
export const BAR_SIZE = 22
export const RADIUS_COLUMN: [number, number, number, number] = [4, 4, 0, 0]
export const RADIUS_BAR: [number, number, number, number] = [0, 4, 4, 0]

/** Eixos e grade em hairline sólido, um passo abaixo da superfície. */
export const axisProps = {
  stroke: INK.axis,
  tickLine: false,
  tick: { fill: INK.muted, fontSize: 14 },
} as const
