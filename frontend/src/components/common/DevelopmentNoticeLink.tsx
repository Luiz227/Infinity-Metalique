import type { AnchorHTMLAttributes, ReactNode } from "react"
import { navigateHome } from "@/lib/router"

export function DevelopmentNoticeLink({ area, children, onClick, ...props }: {
  area: string
  children: ReactNode
} & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const target = area.toLocaleLowerCase("pt-BR") as "ajuda" | "contato"

  return (
    <a
      href={`/#${target}`}
      {...props}
      onClick={(event) => {
        event.preventDefault()
        onClick?.(event as any)
        navigateHome(target)
      }}
    >
      {children}
    </a>
  )
}
