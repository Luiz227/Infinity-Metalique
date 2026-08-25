import type { MouseEvent, ReactNode, Ref } from "react"

export type Route =
  | "/"
  | "/login"
  | "/solicitar-acesso"
  | "/sistema"
  | "/qualidade"
  | "/usuarios"
  | "/piperun"
  | "/sige"

export type HomeSection =
  | "home"
  | "ajuda"
  | "contato"

type InfinityHistoryState = {
  infinityModal?: {
    backgroundHref: string
  }
}

const authModalRoutes = new Set<Route>(["/login", "/solicitar-acesso"])

const routes = new Set<Route>([
  "/",
  "/login",
  "/solicitar-acesso",
  "/sistema",
  "/qualidade",
  "/usuarios",
  "/piperun",
  "/sige",
])

export function currentRoute(): Route {
  const path =
    window.location.pathname.replace(/\/$/, "") || "/"

  return routes.has(path as Route)
    ? (path as Route)
    : "/"
}

export function navigate(
  route: Route,
  replace = false,
  state: InfinityHistoryState = {},
): void {
  window.history[
    replace ? "replaceState" : "pushState"
  ](state, "", route)

  window.dispatchEvent(
    new Event("metalique:navigate"),
  )
}

/**
 * Fecha uma rota modal sem empilhar uma segunda Home no histórico.
 * Em um link direto não existe tela de fundo anterior, então a própria
 * entrada é substituída pela Home.
 */
export function closeAuthModal(): void {
  const state = window.history.state as InfinityHistoryState | null

  if (state?.infinityModal?.backgroundHref && window.history.length > 1) {
    window.history.back()
    return
  }

  navigate("/", true)
}

/** Troca o formulário aberto sem criar uma pilha Login ↔ Cadastro. */
export function replaceAuthModal(route: "/login" | "/solicitar-acesso"): void {
  const state = window.history.state as InfinityHistoryState | null
  navigate(route, true, state || {})
}

export function navigateHome(
  section: HomeSection,
  replace = false,
): void {
  const url =
    section === "home"
      ? "/"
      : `/#${section}`

  window.history[
    replace ? "replaceState" : "pushState"
  ]({}, "", url)

  window.dispatchEvent(
    new Event("metalique:navigate"),
  )

  window.dispatchEvent(
    new Event("metalique:home-section"),
  )
}

export function AppLink({
  to,
  className,
  children,
  ariaLabel,
  ref,
}: {
  to: Route
  className?: string
  children: ReactNode
  ariaLabel?: string
  /** Quem precisa medir o link recebe o próprio <a>. */
  ref?: Ref<HTMLAnchorElement>
}) {
  const openRoute = (
    event: MouseEvent<HTMLAnchorElement>,
  ) => {
    const isNormalClick =
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.button === 0

    if (isNormalClick) {
      event.preventDefault()
      const state = authModalRoutes.has(to) && currentRoute() === "/"
        ? {
            infinityModal: {
              backgroundHref: `${window.location.pathname}${window.location.search}${window.location.hash}`,
            },
          }
        : {}

      navigate(to, false, state)
    }
  }

  return (
    <a
      ref={ref}
      href={to}
      className={className}
      aria-label={ariaLabel}
      onClick={openRoute}
    >
      {children}
    </a>
  )
}
