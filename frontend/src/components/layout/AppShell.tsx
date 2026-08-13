import { type ReactNode, type RefObject } from "react"

import { AppHeader } from "@/components/layout/AppHeader"
import type { Route } from "@/lib/router"
import type { User } from "@/types"

/**
 * Moldura vermelha com o painel claro por dentro, usada pelas telas internas.
 *
 * A altura é travada na viewport e só o painel rola: assim a moldura e o
 * cabeçalho ficam parados enquanto o conteúdo desce. É `h-dvh` e não `h-screen`
 * porque em navegador de celular `100vh` inclui a barra de endereço retrátil, e
 * o rodapé da moldura acabaria escondido atrás dela.
 */
export function AppShell({ user, csrfToken, active, onUserUpdated, onLogout, scrollRef, embedded = false, children }: {
  user: User
  csrfToken: string
  active: Route
  onUserUpdated: (user: User) => void
  onLogout: () => void
  /** Quem monta o shell usa esta referência para voltar ao topo ao trocar de rota. */
  scrollRef?: RefObject<HTMLDivElement | null>
  embedded?: boolean
  children: ReactNode
}) {
  // Sem padding no topo: quem afasta o logo da borda é o py-7 do próprio
  // cabeçalho, e as duas caixas são vermelhas, então o padding daqui só
  // somaria ao dele.
  return (
    <main className="h-dvh overflow-hidden bg-[#db0f0f] px-3 pb-3 text-black sm:px-5 sm:pb-5 lg:px-[2vw] lg:pb-[1.5vw]">
      <div className="mx-auto flex h-full min-h-0 max-w-[1788px] flex-col overflow-hidden rounded-[28px] bg-[#db0f0f] text-white lg:rounded-[50px]">
        <AppHeader
          user={user}
          csrfToken={csrfToken}
          active={active}
          onUserUpdated={onUserUpdated}
          onLogout={onLogout}
        />

        {/* O painel arredondado não rola: a barra nativa é pintada na borda da
            caixa e o border-radius do próprio elemento não a recorta, então ela
            atravessaria a curva. Quem rola é a caixa de dentro, e o
            overflow-hidden daqui garante o recorte. */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-[#f2f2f2] text-black sm:mx-[2.4%] sm:mb-[2.4%] lg:mx-[0.3%] lg:mb-[0.3%] lg:rounded-[53px]">
          {/* A margem vertical afasta a barra dos cantos: com ela o polegar só
              começa depois que a curva termina, em vez de ser cortado por ela. */}
          <div
            ref={scrollRef}
            className={embedded
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "app-scroll my-8 flex min-h-0 flex-1 flex-col overflow-y-auto px-[5%] lg:my-10 lg:px-[1.7%]"}
          >
            {children}
          </div>
        </section>
      </div>
    </main>
  )
}
