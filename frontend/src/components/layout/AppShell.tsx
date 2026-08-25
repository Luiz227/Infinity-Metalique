import { type ReactNode, type RefObject, useEffect, useRef } from "react"

import { AppHeader } from "@/components/layout/AppHeader"
import { Scroller } from "@/components/ui/scroller"
import { postJson } from "@/lib/api"
import type { Route } from "@/lib/router"
import type { User } from "@/types"

/**
 * Moldura clara com o painel de gradiente por dentro, usada pelas telas internas.
 *
 * A moldura não é mais uma massa de cor: quem a desenha é o respiro dos gutters
 * em volta do painel, mais a linha de 1px que contorna ele. Moldura e card são
 * ambos brancos, então é o gradiente do painel que separa um do outro.
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
  onLogout: (csrfToken: string) => void
  /** Quem monta o shell usa esta referência para voltar ao topo ao trocar de rota. */
  scrollRef?: RefObject<HTMLDivElement | null>
  embedded?: boolean
  children: ReactNode
}) {
  const lastHeartbeatAt = useRef(0)

  useEffect(() => {
    if (!csrfToken) return

    let disposed = false

    const sendHeartbeat = () => {
      if (disposed) return

      const now = Date.now()
      if (now - lastHeartbeatAt.current < 30_000) return

      lastHeartbeatAt.current = now
      void postJson<{ presence: "online" }>("/backend/api/presence-heartbeat.php", { csrfToken })
        .catch(() => undefined)
    }

    const activityEvents = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const
    const passiveOptions: AddEventListenerOptions = { passive: true, capture: true }

    sendHeartbeat()
    activityEvents.forEach((eventName) => window.addEventListener(eventName, sendHeartbeat, passiveOptions))
    window.addEventListener("focus", sendHeartbeat)

    return () => {
      disposed = true
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, sendHeartbeat, passiveOptions))
      window.removeEventListener("focus", sendHeartbeat)
    }
  }, [csrfToken])

  // O painel guarda 13px contra as bordas da página; o cabeçalho respira mais,
  // com 20px em cima e embaixo (o de cima é o que o afasta do topo da janela).
  return (
    <main className="h-dvh overflow-hidden bg-frame px-[13px] pb-[13px] text-ink">
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-frame text-ink">
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
            overflow-hidden daqui garante o recorte.

            A borda é a moldura de verdade da tela: sem ela o painel encostaria
            no branco da moldura sem nenhuma linha entre os dois. */}
        <section className="surface-gradient flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-hairline text-ink">
          {/* A margem vertical afasta a barra dos cantos: com ela o polegar só
              começa depois que a curva termina, em vez de ser cortado por ela.

              `scroll-fade` dissolve o conteúdo nas duas pontas em vez de cortá-lo
              na linha da margem. A medida do fade acompanha essa mesma margem,
              para o conteúdo terminar de sumir junto com o respiro.

              PipeRun e SIGE embutem uma janela própria que ocupa a altura toda:
              ali não há o que rolar, e um scroller a mais só atrapalharia. */}
          {embedded ? (
            <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {children}
            </div>
          ) : (
            <Scroller
              ref={scrollRef}
              className="app-scroll scroll-fade my-8 flex min-h-0 flex-1 flex-col overflow-y-auto lg:my-10 lg:[--scroll-fade-size:2.5rem]"
              contentClassName="flex min-h-0 flex-1 flex-col px-[5%] lg:px-[1.7%]"
            >
              {children}
            </Scroller>
          )}
        </section>
      </div>
    </main>
  )
}
