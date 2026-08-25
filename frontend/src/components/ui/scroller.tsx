import * as React from "react"

import { type SmoothScrollOptions, useSmoothScroll } from "@/lib/smoothScroll"
import { cn } from "@/lib/utils"

/**
 * Caixa rolável com rolagem suave.
 *
 * Os dois níveis não são enfeite: o Lenis exige que o elemento de conteúdo seja
 * filho direto do que rola, e que os dois sejam diferentes. Daí a divisão fixa
 * de responsabilidades entre as duas classes:
 *
 * - `className` (o que rola): tamanho, `overflow`, `scroll-fade`, `overscroll`.
 * - `contentClassName` (o que passa por dentro): recuo e disposição dos filhos.
 *
 * Recuo no conteúdo, e não no que rola, também é o que garante que o respiro de
 * baixo entre na conta da rolagem em vez de virar um pedaço morto no fim.
 */
export function Scroller({
  className,
  contentClassName,
  options,
  enabled = true,
  ref,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  contentClassName?: string
  options?: SmoothScrollOptions
  /** Falso mantém a caixa como está e só desliga a rolagem suave. */
  enabled?: boolean
}) {
  const wrapperRef = React.useRef<HTMLDivElement | null>(null)
  const contentRef = React.useRef<HTMLDivElement | null>(null)

  // O ref de fora aponta para o que rola, e não para o conteúdo: quem chama
  // continua recebendo o mesmo nó que receberia de um `<div>` comum.
  const attachWrapper = React.useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node
    if (typeof ref === "function") ref(node)
    else if (ref) ref.current = node
  }, [ref])

  useSmoothScroll(wrapperRef, contentRef, { enabled, ...options })

  return (
    <div ref={attachWrapper} data-slot="scroller" className={className} {...props}>
      <div ref={contentRef} className={cn(contentClassName)}>
        {children}
      </div>
    </div>
  )
}
