import { useEffect, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { AnimatePresence, MotionConfig, motion } from "motion/react"

import { AppShell } from "@/components/layout/AppShell"
import { getJson } from "@/lib/api"
import { type Route, currentRoute, navigate } from "@/lib/router"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { HomePage } from "@/pages/home/HomePage"
import { LoginPage } from "@/pages/login/LoginPage"
import { RequiredPasswordChangePage } from "@/pages/password-change/RequiredPasswordChangePage"
import { AccessRequestPage } from "@/pages/access-request/AccessRequestPage"
import { QualityPage } from "@/pages/quality/QualityPage"
import { ExternalAppPage } from "@/pages/external-app/ExternalAppPage"
import { UsersPage } from "@/pages/users/UsersPage"
import type { ApiResponse, PermissionKey, User } from "@/types"

/** Rotas que vivem dentro da moldura vermelha e exigem sessão. */
const INTERNAL_ROUTES: Route[] = ["/sistema", "/qualidade", "/usuarios", "/piperun", "/sige"]
const ROUTE_PERMISSIONS: Partial<Record<Route, PermissionKey>> = {
  "/sistema": "dashboard.view",
  "/qualidade": "quality.view",
  "/usuarios": "users.manage",
  "/piperun": "piperun.view",
  "/sige": "sige.view",
}

function canOpen(user: User, route: Route): boolean {
  if (user.role === "admin") return true
  const permission = ROUTE_PERMISSIONS[route]
  return !permission || user.permissions.includes(permission)
}

function firstAllowedRoute(user: User): Route {
  return INTERNAL_ROUTES.find((candidate) => canOpen(user, candidate)) || "/"
}

function isQualityOnlyAccount(user: User): boolean {
  if (!Array.isArray(user.permissions)) return false
  return user.role !== "admin"
    && user.permissions.includes("quality.view")
    && !user.permissions.includes("dashboard.view")
    && !user.permissions.includes("users.manage")
    && !user.permissions.includes("piperun.view")
    && !user.permissions.includes("sige.view")
}

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
    } else if (!isLoading && user && INTERNAL_ROUTES.includes(route) && !canOpen(user, route)) {
      navigate(firstAllowedRoute(user), true)
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
      "/usuarios": "Usuários | Metalique Infinity",
      "/piperun": "PipeRun | Metalique Infinity",
      "/sige": "SIGE | Metalique Infinity",
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

  if (user?.must_change_password) {
    return (
      <RequiredPasswordChangePage
        user={user}
        csrfToken={csrfToken}
        onChanged={(updatedUser) => {
          setUser(updatedUser)
          navigate(firstAllowedRoute(updatedUser), true)
        }}
        onLogout={(renewedCsrfToken) => {
          setCsrfToken(renewedCsrfToken)
          setUser(null)
          navigate("/login", true)
        }}
      />
    )
  }

  if (route === "/login") {
    return (
      <LoginPage
        csrfToken={csrfToken}
        onAuthenticated={(authenticatedUser, renewedCsrfToken) => {
          setCsrfToken(renewedCsrfToken)
          setUser(authenticatedUser)
          navigate(firstAllowedRoute(authenticatedUser))
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
          embedded={route === "/piperun" || route === "/sige"}
          scrollRef={panelRef}
          onUserUpdated={setUser}
          onLogout={(renewedCsrfToken) => {
            setCsrfToken(renewedCsrfToken)
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
              {route === "/qualidade" && (
                <QualityPage
                  csrfToken={csrfToken}
                  permissions={user.permissions || []}
                  canCreateRap={user.role === "admin" || user.permissions.includes("quality.create_rap")}
                  canCreateDispatch={user.role === "admin" || user.permissions.includes("quality.create_dispatch")}
                  canDelete={user.role === "admin" || user.permissions.includes("quality.manage")}
                  tabsInHeader={isQualityOnlyAccount(user)}
                />
              )}
              {route === "/usuarios" && <UsersPage csrfToken={csrfToken} currentUserId={user.id} />}
              {route === "/sistema" && <DashboardPage />}
              {route === "/piperun" && <ExternalAppPage appId="piperun" name="PipeRun" />}
              {route === "/sige" && <ExternalAppPage appId="sige" name="SIGE" />}
            </motion.div>
          </AnimatePresence>
        </AppShell>
      </MotionConfig>
    )
  }

  return (
    <HomePage
      user={user}
      csrfToken={csrfToken}
      onLogout={(renewedCsrfToken) => {
        setCsrfToken(renewedCsrfToken)
        setUser(null)
      }}
    />
  )
}

export default App
