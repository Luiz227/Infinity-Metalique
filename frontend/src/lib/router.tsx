import type { MouseEvent, ReactNode } from "react"

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
): void {
  window.history[
    replace ? "replaceState" : "pushState"
  ]({}, "", route)

  window.dispatchEvent(
    new Event("metalique:navigate"),
  )
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
}: {
  to: Route
  className?: string
  children: ReactNode
  ariaLabel?: string
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
      navigate(to)
    }
  }

  return (
    <a
      href={to}
      className={className}
      aria-label={ariaLabel}
      onClick={openRoute}
    >
      {children}
    </a>
  )
}