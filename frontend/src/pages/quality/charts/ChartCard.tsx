import { type ReactNode, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { BarChart3, Info, Maximize2, Minimize2, Printer, Table2 } from "lucide-react"
import { AnimatePresence, motion, type Variants, useReducedMotion } from "motion/react"

import { Scroller } from "@/components/ui/scroller"
import { ChartModeProvider } from "@/pages/quality/charts/ChartMode"
import { ChartPrintSheet } from "@/pages/quality/print/ChartPrintSheet"

/** Tabela equivalente ao gráfico: todo valor continua acessível sem depender de cor. */
export type ChartTable = { head: string[]; rows: (string | number)[][] }

/**
 * O corpo do cartão. Só em tela cheia ele rola - e só aí vira Scroller, com a
 * rolagem suave junto. No cartão pequeno o conteúdo cabe inteiro, então o
 * elemento continua sendo o mesmo <div> de sempre.
 */
function ChartBody({ isFullscreen, children }: { isFullscreen: boolean; children: ReactNode }) {
  if (!isFullscreen) return <div className="mt-4 flex-1">{children}</div>

  return (
    <Scroller
      className="scroll-fade mt-4 min-h-0 flex-1 overflow-auto overscroll-contain"
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      {children}
    </Scroller>
  )
}

const EXPAND_EASE = [0.22, 1, 0.36, 1] as const
const FULLSCREEN_CLIP = "inset(0px 0px 0px 0px round 0px)"

type FullscreenTransition = {
  clipPath: string
  reducedMotion: boolean
}

const fullscreenVariants: Variants = {
  open: ({ reducedMotion }: FullscreenTransition) => ({
    clipPath: FULLSCREEN_CLIP,
    transition: { duration: reducedMotion ? 0 : 0.42, ease: EXPAND_EASE },
  }),
  closed: ({ clipPath, reducedMotion }: FullscreenTransition) => ({
    clipPath,
    transition: { duration: reducedMotion ? 0 : 0.32, ease: EXPAND_EASE },
  }),
}

function clipPathFor(element: Element | null): string | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  const top = Math.max(0, rect.top)
  const right = Math.max(0, window.innerWidth - rect.right)
  const bottom = Math.max(0, window.innerHeight - rect.bottom)
  const left = Math.max(0, rect.left)
  return `inset(${top}px ${right}px ${bottom}px ${left}px round 16px)`
}

function Help({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" className="text-ink-muted outline-none transition-colors hover:text-ink focus-visible:text-ink" aria-label="Sobre este gráfico">
        <Info className="size-3.5" />
      </button>
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-6 z-50 hidden w-64 -translate-x-1/2 rounded-lg border border-hairline bg-white p-3 text-xs font-normal leading-snug text-ink-soft shadow-xl group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  )
}

export function ChartCard({ title, description, help, table, className = "", children }: {
  title: string
  description?: string
  help?: string
  table?: ChartTable
  className?: string
  children: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [fullscreenPresent, setFullscreenPresent] = useState(false)
  const [placeholderHeight, setPlaceholderHeight] = useState<number | null>(null)
  const [hasTransitioned, setHasTransitioned] = useState(false)
  const [transitionClip, setTransitionClip] = useState(FULLSCREEN_CLIP)
  const inlineCardRef = useRef<HTMLElement | null>(null)
  const placeholderRef = useRef<HTMLDivElement | null>(null)
  const inlineButtonRef = useRef<HTMLButtonElement | null>(null)
  const fullscreenButtonRef = useRef<HTMLButtonElement | null>(null)
  const shouldReduceMotion = useReducedMotion()
  const reactId = useId().replace(/:/g, "")
  const componentId = `quality-chart-card-${reactId}`
  const dialogId = `${componentId}-dialog`
  const titleId = `${dialogId}-title`

  const openFullscreen = () => {
    const rect = inlineCardRef.current?.getBoundingClientRect()
    if (rect) {
      setPlaceholderHeight(rect.height)
      setTransitionClip(clipPathFor(inlineCardRef.current) ?? FULLSCREEN_CLIP)
    }
    setHasTransitioned(true)
    setFullscreenPresent(true)
    setExpanded(true)
  }

  const closeFullscreen = () => {
    const destination = clipPathFor(placeholderRef.current)
    if (destination) setTransitionClip(destination)
    setExpanded(false)
  }

  useEffect(() => {
    if (!fullscreenPresent) return
    const previousOverflow = document.body.style.overflow
    const appRoot = document.getElementById("root")
    const previousInert = appRoot?.inert ?? false
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFullscreen()
    }

    document.body.style.overflow = "hidden"
    if (appRoot) appRoot.inert = true
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      if (appRoot) appRoot.inert = previousInert
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [fullscreenPresent])

  useEffect(() => {
    if (!expanded) return
    const frame = window.requestAnimationFrame(() => fullscreenButtonRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [expanded])

  useEffect(() => {
    if (fullscreenPresent || !hasTransitioned) return
    const frame = window.requestAnimationFrame(() => inlineButtonRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [fullscreenPresent, hasTransitioned])

  const renderCard = (isFullscreen: boolean) => (
    <ChartModeProvider mode={isFullscreen ? "fullscreen" : "inline"}>
      <section
        ref={isFullscreen ? undefined : inlineCardRef}
        className={`flex flex-col border bg-surface p-5 ${
          isFullscreen
            ? "h-full w-full overflow-hidden rounded-none border-transparent sm:p-8"
            : `rounded-card border-hairline ${className}`
        }`}
        role={isFullscreen ? "dialog" : undefined}
        id={isFullscreen ? dialogId : undefined}
        aria-modal={isFullscreen ? true : undefined}
        aria-labelledby={isFullscreen ? titleId : undefined}
      >
        <motion.div
          className="flex min-h-0 flex-1 flex-col"
          initial={hasTransitioned && !shouldReduceMotion ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, transition: { duration: 0.12, ease: "easeOut" } }}
          transition={shouldReduceMotion
            ? { duration: 0 }
            : { duration: 0.18, delay: isFullscreen ? 0.1 : 0.06, ease: "easeOut" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id={isFullscreen ? titleId : undefined} className="flex items-center gap-1.5 text-[17px] font-semibold leading-tight text-ink">
                {title}
                {help && <Help text={help} />}
              </h3>
              {description && <p className="mt-1 text-xs leading-snug text-ink-soft">{description}</p>}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* Só em tela cheia: o cartão pequeno da grade mostra um recorte
                  do visual (o ranking corta linhas), e o que vai ao papel é a
                  leitura inteira que a tela cheia abre. */}
              {isFullscreen && (
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-xs text-ink-soft transition-colors hover:bg-neutral-50 disabled:opacity-60"
                  onClick={() => setIsPrinting(true)}
                  disabled={isPrinting}
                  title="Imprimir / salvar PDF"
                >
                  <Printer className="size-3.5" />
                  Imprimir
                </button>
              )}
              {table && (
                <button type="button" className="flex shrink-0 items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-xs text-ink-soft transition-colors hover:bg-neutral-50" onClick={() => setShowTable((current) => !current)} aria-pressed={showTable}>
                  {showTable ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
                  {showTable ? "Gráfico" : "Tabela"}
                </button>
              )}
              <button
                ref={isFullscreen ? fullscreenButtonRef : inlineButtonRef}
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline text-ink-soft transition-colors hover:bg-neutral-50"
                onClick={isFullscreen ? closeFullscreen : openFullscreen}
                aria-controls={isFullscreen ? undefined : dialogId}
                aria-expanded={isFullscreen}
                aria-haspopup={isFullscreen ? undefined : "dialog"}
                aria-label={isFullscreen ? "Sair da tela cheia" : "Abrir gráfico em tela cheia"}
                title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
              >
                {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </button>
            </div>
          </div>

          {/* Em tela cheia quem rola é o corpo, não o cartão: o cartão tem fundo
              próprio e mascará-lo abriria um rasgo translúcido para a tela de
              trás. Rolando aqui, o título fica parado e o fade come só o
              conteúdo. */}
          {/* Fora da tela cheia esta caixa não rola, então continua um <div>:
              trocá-la por um Scroller só acrescentaria um nível entre o cartão e
              o gráfico, sem nada a ganhar. */}
          <ChartBody isFullscreen={isFullscreen}>
            {showTable && table ? (
              <Scroller className={`scroll-fade-bottom [--scroll-fade-size:1.5rem] ${isFullscreen ? "max-h-[calc(100dvh-150px)]" : "max-h-[300px]"} overflow-auto`}>
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr>{table.head.map((cell) => <th key={cell} className="border-b border-[#e1e0d9] pb-2 pr-3 font-medium text-ink-soft">{cell}</th>)}</tr>
                  </thead>
                  <tbody className="[font-variant-numeric:tabular-nums]">
                    {table.rows.map((row, index) => (
                      <tr key={index} className="border-b border-[#f0efec] last:border-0">
                        {row.map((cell, cellIndex) => <td key={cellIndex} className="py-2 pr-3 text-ink">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroller>
            ) : children}
          </ChartBody>
        </motion.div>
      </section>
    </ChartModeProvider>
  )

  const fullscreenPortal = typeof document === "undefined"
    ? null
    : createPortal(
        <AnimatePresence
          initial={false}
          custom={{ clipPath: transitionClip, reducedMotion: Boolean(shouldReduceMotion) } satisfies FullscreenTransition}
          onExitComplete={() => {
            setFullscreenPresent(false)
            setPlaceholderHeight(null)
          }}
        >
          {expanded && (
            <motion.div
              key={componentId}
              custom={{ clipPath: transitionClip, reducedMotion: Boolean(shouldReduceMotion) } satisfies FullscreenTransition}
              variants={fullscreenVariants}
              // A classe é para o `@media print`: esta caixa ocupa a viewport
              // inteira e sairia como uma folha em branco antes da folha de
              // verdade, que é a `ChartPrintSheet`.
              className="quality-chart-fullscreen fixed inset-0 z-[100]"
              style={{ willChange: "clip-path" }}
              initial={shouldReduceMotion ? false : { clipPath: transitionClip }}
              animate="open"
              exit="closed"
            >
              {renderCard(true)}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )

  return (
    <>
      {fullscreenPresent ? (
        <div
          ref={placeholderRef}
          aria-hidden="true"
          className={`pointer-events-none relative ${className}`}
          style={{ height: placeholderHeight ?? 1 }}
        />
      ) : renderCard(false)}
      {fullscreenPortal}
      {isPrinting && (
        <ChartPrintSheet
          title={title}
          description={description}
          table={table}
          showTable={showTable}
          onDone={() => setIsPrinting(false)}
        >
          {children}
        </ChartPrintSheet>
      )}
    </>
  )
}
