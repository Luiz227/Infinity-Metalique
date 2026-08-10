import { useEffect, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { AnimatePresence, MotionConfig, motion } from "motion/react"

import { AppShell } from "@/components/layout/AppShell"
import { getJson } from "@/lib/api"
import { type Route, currentRoute, navigate } from "@/lib/router"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { HomePage } from "@/pages/home/HomePage"
import { LoginPage } from "@/pages/login/LoginPage"
import { AccessRequestPage } from "@/pages/access-request/AccessRequestPage"
import { QualityPage } from "@/pages/quality/QualityPage"
import type { ApiResponse, User } from "@/types"

/** Rotas que vivem dentro da moldura vermelha e exigem sessão. */
const INTERNAL_ROUTES: Route[] = ["/sistema", "/qualidade"]

function App() {
  const [route, setRoute] = useState<Route>(currentRoute())
  const [csrfToken, setCsrfToken] = useState("")
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleRouteChange = () => setRoute(currentRoute())
    window.addEventListener("popstate", handleRouteChange)
    window.addEventListener("metalique:navigate", handleRouteChange)

    return () => {
      window.removeEventListener("popstate", handleRouteChange)
      window.removeEventListener("metalique:navigate", handleRouteChange)
    }
  }, [])

  useEffect(() => {
    const loadSession = async () => {
      try {
        const payload = await getJson<ApiResponse>("/backend/api/csrf.php")
        setCsrfToken(payload.csrfToken || "")
        setUser(payload.user || null)
      } finally {
        setIsLoading(false)
      }
    }

    void loadSession()
  }, [])

  useEffect(() => {
    if (!isLoading && INTERNAL_ROUTES.includes(route) && !user) {
      navigate("/login", true)
    }
  }, [isLoading, route, user])

  // O painel não desmonta ao trocar de tela, então a rolagem anterior seguiria valendo.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [route])

  useEffect(() => {
    const titles: Record<Route, string> = {
      "/": "Metalique Infinity",
      "/login": "Login | Metalique Infinity",
      "/solicitar-acesso": "Solicitar acesso | Metalique Infinity",
      "/sistema": "Dashboard | Metalique Infinity",
      "/qualidade": "Qualidade | Metalique Infinity",
    }
    document.title = titles[route]
  }, [route])

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#db0f0f] text-white">
        <LoaderCircle className="size-8 animate-spin" aria-label="Carregando" />
      </main>
    )
  }

  if (route === "/login") {
    return (
      <LoginPage
        csrfToken={csrfToken}
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser)
          navigate("/sistema")
        }}
      />
    )
  }

  if (route === "/solicitar-acesso") {
    return <AccessRequestPage csrfToken={csrfToken} />
  }

  // Um único AppShell serve as duas telas internas: trocar de rota substitui
  // apenas o conteúdo do painel, sem remontar moldura e cabeçalho.
  if (INTERNAL_ROUTES.includes(route) && user) {
    return (
      <MotionConfig reducedMotion="user">
        <AppShell
          user={user}
          csrfToken={csrfToken}
          active={route}
          scrollRef={panelRef}
          onUserUpdated={setUser}
          onLogout={() => {
            setUser(null)
            navigate("/")
          }}
        >
          {/* Só a opacidade é animada: um transform aqui viraria o bloco de contenção
              dos overlays `position: fixed` (formulários e folha de impressão). */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={route}
              className="flex min-h-0 flex-1 flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {route === "/qualidade" ? <QualityPage csrfToken={csrfToken} /> : <DashboardPage />}
            </motion.div>
          </AnimatePresence>
        </AppShell>
      </MotionConfig>
    )
  }

  return <HomePage user={user} csrfToken={csrfToken} onLogout={() => setUser(null)} />
}

export default App
