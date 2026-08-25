import { useRef, type ReactNode } from "react"
import { MotionConfig, motion } from "motion/react"

import { AppLink } from "@/lib/router"
import { useSmoothScroll } from "@/lib/smoothScroll"
import { useHorizontalOverflow } from "@/lib/useHorizontalOverflow"
import { cn } from "@/lib/utils"

/**
 * Moldura das telas públicas: Home, Login e Solicitar acesso.
 *
 * Substituiu três composições que viviam em coordenadas absolutas de um frame
 * do Figma (1788 × 1005,75). Aqui é tudo fluxo: a barra é uma grade de três
 * colunas e o painel ocupa o que sobra. O que antes precisava de dois blocos de
 * @media só para reposicionar peças agora se acomoda sozinho.
 *
 * A mesma gramática do sistema por dentro da moldura: fundo claro, painel com
 * gradiente e uma linha de 1px contornando ele.
 */

/**
 * Arcos concêntricos no canto direito, a única decoração do painel.
 *
 * O traço é bem mais fraco que o hairline dos cartões de propósito: aqui a
 * linha é ornamento, e no cartão ela é estrutura. Se as duas tivessem o mesmo
 * peso, o olho leria os arcos como se fossem borda de alguma coisa.
 *
 * O centro fica fora da tela, à direita: o que aparece são só os trechos de
 * curva que cortam o painel, como na referência.
 */
function Arcs() {
  return (
    <svg
      className="pointer-events-none absolute right-0 top-1/2 h-[190%] max-h-none -translate-y-1/2 translate-x-[38%]"
      viewBox="0 0 600 600"
      fill="none"
      aria-hidden="true"
    >
      {Array.from({ length: 10 }, (_, index) => (
        <circle
          key={index}
          cx="300"
          cy="300"
          r={96 + index * 21}
          stroke="var(--decorative-arc)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

const metaliqueLinePositions = [
  "right-[-42%] top-[44%] sm:right-[-28%] lg:right-[-18%]",
  "right-[2%] top-1/2 sm:right-[8%] lg:right-[12%]",
  "right-[46%] top-[56%] sm:right-[44%] lg:right-[42%]",
]

/** Três instâncias em escala abstrata dos nodes 89:574, 89:580 e 89:577. */
function MetaliqueLines() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {metaliqueLinePositions.map((position) => (
        <div
          key={position}
          className={`absolute aspect-[123.145/278.798] h-[190%] -translate-y-1/2 opacity-[0.07] ${position}`}
        >
          <img className="size-full scale-x-[-1] brightness-0" src="/images/linha-metalique.svg" alt="" />
        </div>
      ))}
    </div>
  )
}

export type PublicNavItem = {
  label: string
  active?: boolean
  onSelect: () => void
}

export function PublicShell({ nav, actions, photo, surface = "neutral", fill = false, children }: {
  nav: PublicNavItem[]
  /** Bloco da direita da barra: entrar, sair, solicitar acesso. */
  actions: ReactNode
  /** Fotografia de fundo do painel. Sem ela o painel fica só no gradiente. */
  photo?: { src: string; alt: string }
  /** A Home usa a superfície de marca; Login e cadastro permanecem neutros. */
  surface?: "neutral" | "metalique"
  /**
   * Prende a moldura à altura da janela, para o conteúdo rolar por dentro do
   * painel em vez de esticá-lo.
   *
   * O padrão continua sendo o contrário: as telas de sempre têm pouco conteúdo,
   * e o piso de 560px garante que o painel nunca fique achatado numa janela
   * baixa. Quem carrega uma lista longa (a aba Contato) precisa do oposto - sem
   * isto, o painel cresceria alguns milhares de pixels e a barra de navegação
   * sairia da tela junto.
   */
  fill?: boolean
  children: ReactNode
}) {
  const isMetaliqueSurface = surface === "metalique"
  const navRef = useRef<HTMLElement>(null)
  const navContentRef = useRef<HTMLDivElement | null>(null)

  // Roda vertical vira deslocamento lateral (padrão do Lenis na orientação
  // horizontal), e `overscroll` ligado devolve o giro à página nas pontas.
  useSmoothScroll(navRef, navContentRef, { orientation: "horizontal", overscroll: true })
  const navHasOverflow = useHorizontalOverflow(navRef)

  return (
    <MotionConfig reducedMotion="user">
      <main className={cn(
        "flex flex-col bg-frame px-[13px] pb-[13px] text-ink",
        // Piso mesmo no modo preso: numa janela muito baixa é melhor a página
        // rolar do que o painel virar uma fresta.
        fill ? "h-dvh min-h-[520px]" : "min-h-dvh",
      )}>
      <div className={cn("flex w-full flex-1 flex-col", fill && "min-h-0")}>
        {/* Três colunas com o menu no meio: as laterais valem o próprio
            conteúdo e o menu se centra na coluna 1fr, que é o que sobra.
            O painel guarda 13px nas bordas da página e o cabeçalho respira
            20px em cima e embaixo — mesma medida do cabeçalho do sistema, para
            a barra de navegação não pular na vertical ao entrar nele. */}
        <header className="header-stack header-sizing grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-[20px] sm:gap-4 lg:grid-cols-[1fr_minmax(0,auto)_1fr]">
          <AppLink className="col-start-1 row-start-1 flex shrink-0 items-center justify-self-start" to="/" ariaLabel="Metalique Infinity">
            <img className="h-[var(--header-control-size)] w-auto" src="/images/logo.svg" alt="Metalique Infinity" />
          </AppLink>

          {/* Pílulas independentes mantêm a navegação leve: não há uma segunda
              cápsula envolvendo o conjunto inteiro. */}
          <motion.nav
            layoutScroll
            layoutId="infinity-header-nav"
            ref={navRef}
            className="nav-scroller relative col-start-2 row-start-1 min-w-0 max-w-full justify-self-center overflow-x-auto rounded-full text-[15px] font-light lg:text-sm"
            initial={false}
            animate={{
              backgroundColor: navHasOverflow ? "var(--header-nav-overflow-bg)" : "var(--header-nav-idle-bg)",
              boxShadow: navHasOverflow
                ? "var(--header-nav-overflow-shadow)"
                : "var(--header-nav-idle-shadow)",
            }}
            transition={{
              layout: { type: "spring", stiffness: 280, damping: 30, mass: 0.8 },
              backgroundColor: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
              boxShadow: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
            }}
            aria-label="Navegação principal"
          >
            {/* Mesma divisão do cabeçalho interno: o Lenis exige um elemento de
                conteúdo dentro do que rola, e o `w-max` é o que o faz valer a
                largura das abas em vez da largura do menu. */}
            <div ref={navContentRef} className="flex w-max items-center gap-1.5 lg:gap-2">
            {nav.map((item) => (
              <motion.button
                key={item.label}
                layout="position"
                type="button"
                className={`relative flex h-[var(--header-control-size)] shrink-0 items-center whitespace-nowrap rounded-full border px-3 leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique lg:px-4 ${
                  item.active
                    ? "border-transparent text-metalique"
                    : "border-hairline bg-transparent text-ink-soft hover:border-hairline-strong hover:bg-surface hover:text-ink"
                }`}
                aria-current={item.active ? "page" : undefined}
                onClick={item.onSelect}
              >
                {item.active && (
                  <motion.span
                    layoutId="infinity-header-active-tab"
                    className="absolute inset-0 rounded-full border border-metalique bg-metalique/[0.04]"
                    transition={{ type: "spring", stiffness: 280, damping: 30, mass: 0.8 }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </motion.button>
            ))}
            </div>
          </motion.nav>

          <div className="public-header-actions col-start-3 row-start-1 flex items-center justify-end gap-2 justify-self-end sm:gap-3">{actions}</div>
        </header>

        <section className={cn(
          isMetaliqueSurface ? "surface-gradient-metalique" : "surface-gradient",
          "relative flex flex-1 flex-col overflow-hidden rounded-[12px] border border-hairline",
          fill ? "min-h-0" : "min-h-[max(560px,60dvh)]",
        )}>
          {/* Desfoque, dessaturação e máscara moram em `.panel-photo`
              (base.css), com o porquê de cada um. Aqui fica só o
              posicionamento. */}
          {photo && (
            <img
              className="panel-photo pointer-events-none absolute inset-0 size-full scale-110 object-cover"
              src={photo.src}
              alt={photo.alt}
              aria-hidden="true"
            />
          )}

          {isMetaliqueSurface ? <MetaliqueLines /> : <Arcs />}

          <motion.div
            className="relative flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </section>
      </div>
      </main>
    </MotionConfig>
  )
}

/** Pílula sólida vermelha: a ação principal de cada tela pública. */
export function PublicPrimaryLink({ to, children }: {
  to: "/login" | "/solicitar-acesso" | "/sistema"
  children: ReactNode
}) {
  return (
    <AppLink
      className="flex h-9 items-center rounded-full bg-metalique px-4 text-sm font-medium text-white transition-colors hover:bg-metalique-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/20 lg:h-10 lg:px-5"
      to={to}
    >
      {children}
    </AppLink>
  )
}

/** Pílula de linha: leve no repouso, com o vermelho restrito ao contorno. */
export function PublicSecondaryLink({ to, children }: {
  to: "/login" | "/solicitar-acesso"
  children: ReactNode
}) {
  return (
    <AppLink
      className="flex h-9 items-center rounded-full border border-metalique bg-transparent px-4 text-sm font-light text-metalique transition-colors hover:bg-metalique/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/15 lg:h-10 lg:px-5"
      to={to}
    >
      {children}
    </AppLink>
  )
}
