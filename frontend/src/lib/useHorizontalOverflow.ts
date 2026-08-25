import { useLayoutEffect, useState, type RefObject } from "react"

/**
 * Observa o espaço real do trilho, não um breakpoint: o fundo do menu só deve
 * surgir quando existe conteúdo escondido que pode ser alcançado por scroll.
 */
export function useHorizontalOverflow<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [hasOverflow, setHasOverflow] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    let animationFrame = 0

    const measure = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => {
        // `scrollWidth` também considera o overflow visual criado pelo `scale`
        // do morph. Durante a troca de headers isso gerava um falso positivo e
        // fazia o fundo aparecer por alguns frames. offsetLeft/offsetWidth
        // representam somente o layout real, sem transforms.
        const items = Array.from(element.children) as HTMLElement[]
        const contentLeft = items.reduce(
          (smallest, item) => Math.min(smallest, item.offsetLeft),
          Number.POSITIVE_INFINITY,
        )
        const contentRight = items.reduce(
          (largest, item) => Math.max(largest, item.offsetLeft + item.offsetWidth),
          0,
        )
        const contentWidth = items.length > 0 ? contentRight - contentLeft : 0
        const nextValue = contentWidth > element.clientWidth
        setHasOverflow((currentValue) => currentValue === nextValue ? currentValue : nextValue)
      })
    }

    const resizeObserver = new ResizeObserver(measure)
    const observeChildren = () => {
      resizeObserver.observe(element)
      Array.from(element.children).forEach((child) => resizeObserver.observe(child))
    }
    const mutationObserver = new MutationObserver(() => {
      observeChildren()
      measure()
    })

    observeChildren()
    mutationObserver.observe(element, { childList: true, subtree: true, characterData: true })
    measure()

    return () => {
      cancelAnimationFrame(animationFrame)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [ref])

  return hasOverflow
}
