import { type RefObject, useEffect, useRef, useSyncExternalStore } from "react"
import Lenis, { type LenisOptions } from "lenis"

import { currentPreferences, onPreferencesChange } from "@/lib/preferences"

/**
 * Rolagem suave das caixas do sistema.
 *
 * A página nunca rola: a moldura é `h-dvh overflow-hidden` e quem rola são as
 * caixas de dentro. Por isso não existe uma instância global do Lenis aqui -
 * cada área rolável ganha a sua, em modo elemento.
 *
 * O Lenis escreve `scrollTop`/`scrollLeft` de verdade em vez de deslocar o
 * conteúdo por `transform`. É o que mantém funcionando, de graça, o
 * `scroll-fade` (que roda em `animation-timeline: scroll()`) e os `thead`
 * grudados das tabelas.
 */

/** Ajuste do toque. Sutil: tira o degrau da roda sem deixar peso na rolagem. */
const SHARED_OPTIONS = {
  lerp: 0.14,
  smoothWheel: true,
  // No toque o sistema já entrega inércia própria, e melhor calibrada que a nossa.
  syncTouch: false,
  // Equivale ao `overscroll-contain` que várias caixas do projeto já declaram:
  // ao chegar na ponta, a roda para aqui em vez de vazar para a caixa de fora.
  overscroll: false,
  // Caixa rolável dentro de caixa rolável (tabela dentro do painel, tabela dentro
  // do gráfico em tela cheia). O evento borbulha, então sem isto a de fora andaria
  // junto com a de dentro. Com isto, a de fora reconhece a aninhada e não reage -
  // quem cuida dela é a instância própria dela.
  allowNestedScroll: true,
  // Um único laço de quadro serve todas as instâncias (ver `tick` abaixo).
  autoRaf: false,
} satisfies LenisOptions

type Registration = {
  instance: Lenis
  wrapper: HTMLElement
  scrollHeight: number
}

/** Instâncias vivas, servidas pelo laço de quadro compartilhado. */
const running = new Set<Registration>()

/** Instância de cada scroller, para quem só tem o nó do DOM em mãos. */
const byElement = new WeakMap<Element, Lenis>()

let frame = 0

// Um `requestAnimationFrame` para todas: são mais de vinte áreas roláveis, e um
// laço por instância seria desperdício. O laço só existe enquanto houver alguma
// instância montada.
//
// A conferência do `scrollHeight` a cada quadro não é zelo excessivo, é o que
// mantém o limite de rolagem correto. O `ResizeObserver` que o Lenis instala
// observa a *caixa* do elemento de conteúdo, e nas telas daqui essa caixa fica
// presa na altura do painel (`flex-1 min-h-0`): ela não cresce quando o conteúdo
// cresce. Sem isto, o limite congelaria no que foi medido na montagem - com o
// painel ainda vazio, esperando a API - e a roda nunca desceria.
//
// A leitura é barata porque acontece antes de qualquer escrita do quadro: o
// `scrollTop` que o Lenis escreve não invalida layout, então não há reflow
// forçado aqui. E `resize()` só é chamado quando a medida realmente mudou.
function tick(time: number) {
  running.forEach((registration) => {
    const scrollHeight = registration.wrapper.scrollHeight
    if (scrollHeight !== registration.scrollHeight) {
      registration.scrollHeight = scrollHeight
      registration.instance.resize()
    }
    registration.instance.raf(time)
  })
  frame = requestAnimationFrame(tick)
}

/**
 * Liga o Lenis num par wrapper/conteúdo e devolve como desligar.
 *
 * `eventsTarget` vai explícito de propósito: o padrão do Lenis é `window`, e com
 * ele toda instância montada reagiria a toda roda do mouse da tela inteira.
 */
function attach(wrapper: HTMLElement, content: HTMLElement, options: LenisOptions): () => void {
  const instance = new Lenis({
    ...SHARED_OPTIONS,
    ...options,
    wrapper,
    content,
    eventsTarget: wrapper,
  })

  const registration: Registration = { instance, wrapper, scrollHeight: wrapper.scrollHeight }

  byElement.set(wrapper, instance)
  running.add(registration)
  if (running.size === 1) frame = requestAnimationFrame(tick)

  return () => {
    running.delete(registration)
    if (byElement.get(wrapper) === instance) byElement.delete(wrapper)
    if (!running.size) {
      cancelAnimationFrame(frame)
      frame = 0
    }
    instance.destroy()
  }
}

/**
 * O elemento de conteúdo, que o Lenis exige ser filho direto do wrapper.
 *
 * Normalmente é um ref nosso. A string é para quando quem desenha o filho é um
 * terceiro - o `CommandList` do cmdk, por exemplo, monta sozinho o
 * `[cmdk-list-sizer]` por dentro.
 */
type SmoothScrollContent = RefObject<HTMLElement | null> | string

export type SmoothScrollOptions = LenisOptions & {
  /** Falso desliga a rolagem suave sem desmontar nada. */
  enabled?: boolean
}

/**
 * Tabela larga que só rola de lado.
 *
 * `gestureOrientation` é a parte que não pode faltar. Quando a orientação é
 * horizontal, o padrão do Lenis é `"both"`: a roda vertical vira deslocamento
 * lateral. Numa tabela que ocupa quase a tela inteira - a de Usuários é assim -
 * isso transformaria o miolo da página numa zona onde a rolagem não desce mais.
 *
 * Com `"horizontal"`, só gesto lateral de verdade (trackpad, shift+roda) move a
 * tabela. A roda vertical passa reto para o painel, e o `allowNestedScroll` dele
 * sabe não ceder: ele deriva o eixo do gesto e vê que não há para onde rolar na
 * vertical aqui.
 */
export const HORIZONTAL_TABLE: SmoothScrollOptions = {
  orientation: "horizontal",
  gestureOrientation: "horizontal",
}

const smoothScrollPreference = () => currentPreferences().smoothScroll

/**
 * As opções são lidas na montagem: mudá-las depois não recria a instância. Para
 * afinar o toque, mexa em `SHARED_OPTIONS` acima.
 *
 * A preferência do usuário é lida aqui, e não em cada `Scroller`: são mais de
 * vinte áreas roláveis, e este é o único lugar por onde todas passam. Desligar
 * a rolagem suave nas configurações desmonta as instâncias vivas na hora - o
 * `enabled` está na lista de dependências do efeito.
 */
export function useSmoothScroll(
  wrapperRef: RefObject<HTMLElement | null>,
  content: SmoothScrollContent,
  { enabled = true, ...options }: SmoothScrollOptions = {},
): void {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const preferSmooth = useSyncExternalStore(onPreferencesChange, smoothScrollPreference, smoothScrollPreference)
  const isEnabled = enabled && preferSmooth

  useEffect(() => {
    if (!isEnabled) return

    const wrapper = wrapperRef.current
    const contentElement = typeof content === "string"
      ? wrapper?.querySelector<HTMLElement>(content)
      : content.current
    if (!wrapper || !contentElement) return

    return attach(wrapper, contentElement, optionsRef.current)
  }, [isEnabled, wrapperRef, content])
}

/**
 * Leva um scroller até uma posição, usando o Lenis dele quando existe.
 *
 * Escrever `scrollTop` por fora não serve: o alvo interno do Lenis fica
 * defasado e ele puxa a rolagem de volta no quadro seguinte. O caminho nativo
 * é a rede para as áreas que ainda não têm instância.
 */
export function scrollElementTo(
  element: HTMLElement | null | undefined,
  target: number,
  { immediate = false, axis = "vertical" }: { immediate?: boolean; axis?: "vertical" | "horizontal" } = {},
): void {
  if (!element) return

  const instance = byElement.get(element)
  if (instance) {
    instance.scrollTo(target, { immediate })
    return
  }

  element.scrollTo({
    [axis === "horizontal" ? "left" : "top"]: target,
    behavior: immediate ? "auto" : "smooth",
  })
}
