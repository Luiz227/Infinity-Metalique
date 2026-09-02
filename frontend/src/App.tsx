import { useEffect, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { AnimatePresence, MotionConfig, motion } from "motion/react"

import { AppShell } from "@/components/layout/AppShell"
import { getJson } from "@/lib/api"
import { hydratePreferences, setPreferencesCsrfToken, usePreferences } from "@/lib/preferences"
import { clearRememberedUser, readRememberedUser, writeRememberedUser } from "@/lib/rememberedUser"
import { closeAuthModal, type Route, currentRoute, navigate, replaceAuthModal } from "@/lib/router"
import { scrollElementTo } from "@/lib/smoothScroll"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { DocumentsPage } from "@/pages/documents/DocumentsPage"
import { HomePage } from "@/pages/home/HomePage"
import { LoginPage } from "@/pages/login/LoginPage"
import { RequiredPasswordChangePage } from "@/pages/password-change/RequiredPasswordChangePage"
import { AccessRequestPage } from "@/pages/access-request/AccessRequestPage"
import { QualityPage } from "@/pages/quality/QualityPage"
import { ExternalAppPage } from "@/pages/external-app/ExternalAppPage"
import { UsersPage } from "@/pages/users/UsersPage"
import type { ApiResponse, HomeSummary, PermissionKey, User } from "@/types"

/** Rotas que vivem dentro da moldura vermelha e exigem sessão. */
const INTERNAL_ROUTES: Route[] = ["/sistema", "/qualidade", "/documentados", "/usuarios", "/piperun", "/sige"]
const ROUTE_PERMISSIONS: Partial<Record<Route, PermissionKey>> = {
  "/sistema": "dashboard.view",
  "/documentados": "documents.view",
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

/**
 * Para onde o login leva.
 *
 * A tela escolhida nas configurações vem primeiro, mas só se a conta ainda
 * puder abri-la: uma permissão revogada não pode deixar a pessoa presa numa
 * tela que vai recusá-la. Sem escolha, ou com escolha que caducou, vale o de
 * sempre - a primeira tela que a conta alcança.
 */
function firstAllowedRoute(user: User, preferred: string = "auto"): Route {
  const isRoute = (candidate: string): candidate is Route => INTERNAL_ROUTES.includes(candidate as Route)
  if (isRoute(preferred) && canOpen(user, preferred)) return preferred

  return INTERNAL_ROUTES.find((candidate) => canOpen(user, candidate)) || "/"
}

function isQualityOnlyAccount(user: User): boolean {
  if (!Array.isArray(user.permissions)) return false
  return user.role !== "admin"
    && user.permissions.includes("quality.view")
    && !user.permissions.includes("dashboard.view")
    && !user.permissions.includes("documents.view")
    && !user.permissions.includes("users.manage")
    && !user.permissions.includes("piperun.view")
    && !user.permissions.includes("sige.view")
}

let initialSessionRequest: Promise<ApiResponse> | null = null
let initialHomeSummaryRequest: Promise<HomeSummary> | null = null

const EMPTY_HOME_SUMMARY: HomeSummary = { total: 0, users: [] }

function loadInitialSession(): Promise<ApiResponse> {
  if (!initialSessionRequest) {
    initialSessionRequest = getJson<ApiResponse>("/backend/api/csrf.php", { cache: "no-store" })
      .catch((error: unknown) => {
        initialSessionRequest = null
        throw error
      })
  }

  return initialSessionRequest
}

function loadInitialHomeSummary(): Promise<HomeSummary> {
  if (!initialHomeSummaryRequest) {
    initialHomeSummaryRequest = getJson<ApiResponse>("/backend/api/summary.php", { cache: "no-store" })
      .then((payload) => ({
        total: payload.total || 0,
        users: payload.users || [],
      }))
      .catch((error: unknown) => {
        initialHomeSummaryRequest = null
        throw error
      })
  }

  return initialHomeSummaryRequest
}

function App() {
  const [route, setRoute] = useState<Route>(currentRoute())
  const [csrfToken, setCsrfToken] = useState("")
  const [user, setUser] = useState<User | null>(null)
  const [rememberedUser, setRememberedUser] = useState(readRememberedUser)
  const [homeSummary, setHomeSummary] = useState<HomeSummary>(EMPTY_HOME_SUMMARY)
  const [isLoading, setIsLoading] = useState(true)
  const preferences = usePreferences()
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
    const handleRenewedCsrfToken = (event: Event) => {
      setCsrfToken((event as CustomEvent<string>).detail)
    }
    window.addEventListener("metalique:csrf-token", handleRenewedCsrfToken)

    return () => window.removeEventListener("metalique:csrf-token", handleRenewedCsrfToken)
  }, [])

  useEffect(() => {
    let active = true

    const restoreSession = async () => {
      // Sessão e resumo da equipe começam juntos. A Home só recebe o primeiro
      // paint depois das duas respostas, sem inserir os avatares tardiamente.
      const [payload, summary] = await Promise.all([
        loadInitialSession().catch(() => ({} as ApiResponse)),
        loadInitialHomeSummary().catch(() => EMPTY_HOME_SUMMARY),
      ])

      if (!active) return
      setCsrfToken(payload.csrfToken || "")
      setUser(payload.user || null)
      setHomeSummary(summary)
      setIsLoading(false)
    }

    void restoreSession()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!isLoading && INTERNAL_ROUTES.includes(route) && !user) {
      navigate("/login", true)
    } else if (!isLoading && user && INTERNAL_ROUTES.includes(route) && !canOpen(user, route)) {
      navigate(firstAllowedRoute(user, preferences.startRoute), true)
    }
  }, [isLoading, preferences.startRoute, route, user])

  // O store grava sozinho, e para isso precisa do token que este componente já
  // acompanha - inclusive nas renovações vindas do evento de CSRF. Vem antes da
  // hidratação de propósito: ela pode disparar uma gravação (o tema herdado da
  // versão antiga) e precisa do token já em mãos.
  useEffect(() => {
    setPreferencesCsrfToken(csrfToken)
  }, [csrfToken])

  // O que a conta gravou noutra máquina passa a valer nesta. O bloco chega
  // junto do usuário, sem requisição própria.
  useEffect(() => {
    hydratePreferences(user?.id, user?.preferences)
  }, [user])

  // Desligar "lembrar meu usuário" apaga na hora o que já estava guardado: a
  // preferência é a única fonte, e não há um segundo botão de esquecer.
  useEffect(() => {
    if (!user) return

    if (!preferences.rememberUser) {
      clearRememberedUser()
      setRememberedUser(null)
      return
    }

    const remembered = writeRememberedUser(user)
    if (remembered) setRememberedUser(remembered)
  }, [preferences.rememberUser, user])

  // O painel não desmonta ao trocar de tela, então a rolagem anterior seguiria
  // valendo. Passa pelo helper porque escrever `scrollTop` por fora deixaria o
  // alvo interno do Lenis defasado, e ele puxaria a rolagem de volta.
  useEffect(() => {
    scrollElementTo(panelRef.current, 0, { immediate: true })
  }, [route])

  useEffect(() => {
    const titles: Record<Route, string> = {
      "/": "Metalique Infinity",
      "/login": "Login | Metalique Infinity",
      "/solicitar-acesso": "Solicitar acesso | Metalique Infinity",
      "/sistema": "Dashboard | Metalique Infinity",
      "/documentados": "Documentados | Metalique Infinity",
      "/qualidade": "Qualidade | Metalique Infinity",
      "/usuarios": "Usuários | Metalique Infinity",
      "/piperun": "PipeRun | Metalique Infinity",
      "/sige": "SIGE | Metalique Infinity",
    }
    document.title = titles[route]
  }, [route])

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-frame text-metalique">
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
          navigate(firstAllowedRoute(updatedUser, updatedUser.preferences?.startRoute), true)
        }}
        onLogout={(renewedCsrfToken) => {
          setCsrfToken(renewedCsrfToken)
          setUser(null)
          navigate("/login", true)
        }}
      />
    )
  }

  // Um único AppShell serve as duas telas internas: trocar de rota substitui
  // apenas o conteúdo do painel, sem remontar moldura e cabeçalho.
  if (INTERNAL_ROUTES.includes(route) && user) {
    // "user" respeita o Windows; "always" é a escolha explícita nas
    // configurações, e vale mesmo com o sistema pedindo movimento.
    return (
      <MotionConfig reducedMotion={preferences.reduceMotion ? "always" : "user"}>
        <AppShell
          user={user}
          csrfToken={csrfToken}
          active={route}
          embedded={route === "/piperun" || route === "/sige" || route === "/documentados"}
          scrollRef={panelRef}
          onUserUpdated={setUser}
          onLogout={(renewedCsrfToken) => {
            setCsrfToken(renewedCsrfToken)
            setUser(null)
            navigate("/")
          }}
        >
          {/* Só a opacidade é animada: um transform aqui viraria o bloco de contenção
              dos overlays `position: fixed` (formulários e folha de impressão).
              Esses overlays hoje saem por portal - o painel é mascarado pelo
              `scroll-fade` e máscara recorta descendente fixo -, mas a regra
              continua valendo para qualquer sobreposto novo. */}
          <AnimatePresence mode="wait">
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
                  canCreateComplaint={user.role === "admin" || user.permissions.includes("quality.create_complaint")}
                  canImport={user.role === "admin" || user.permissions.includes("quality.import")}
                  canDelete={user.role === "admin" || user.permissions.includes("quality.manage")}
                  canEdit={user.role === "admin" || user.permissions.includes("quality.edit")}
                  tabsInHeader={isQualityOnlyAccount(user)}
                />
              )}
              {route === "/usuarios" && <UsersPage csrfToken={csrfToken} currentUserId={user.id} />}
              {route === "/sistema" && <DashboardPage />}
              {route === "/documentados" && (
                <DocumentsPage
                  csrfToken={csrfToken}
                  user={user}
                />
              )}
              {route === "/piperun" && <ExternalAppPage appId="piperun" name="PipeRun" />}
              {route === "/sige" && <ExternalAppPage appId="sige" name="SIGE" />}
            </motion.div>
          </AnimatePresence>
        </AppShell>
      </MotionConfig>
    )
  }

  return (
    <>
      {/* Login e solicitação são rotas modais. A Home permanece montada
          atrás delas, preservando o texto sorteado, a seção e os avatares. */}
      <HomePage
        user={user}
        rememberedUser={rememberedUser}
        summary={homeSummary}
        csrfToken={csrfToken}
        onForgetRememberedUser={() => {
          clearRememberedUser()
          setRememberedUser(null)
        }}
        onLogout={(renewedCsrfToken) => {
          setCsrfToken(renewedCsrfToken)
          setUser(null)
        }}
      />

      {route === "/login" && (
        <LoginPage
          csrfToken={csrfToken}
          rememberedUser={rememberedUser}
          onClose={closeAuthModal}
          onForgetRememberedUser={() => {
            clearRememberedUser()
            setRememberedUser(null)
          }}
          onRequestAccess={() => replaceAuthModal("/solicitar-acesso")}
          onAuthenticated={(authenticatedUser, renewedCsrfToken) => {
            setCsrfToken(renewedCsrfToken)
            setUser(authenticatedUser)
            // A preferência sai do próprio usuário, e não do store: a hidratação
            // só roda no efeito, um render depois de a rota já ter sido decidida.
            // O login não deve reaparecer ao voltar do sistema.
            navigate(firstAllowedRoute(authenticatedUser, authenticatedUser.preferences?.startRoute), true)
          }}
        />
      )}

      {route === "/solicitar-acesso" && (
        <AccessRequestPage
          csrfToken={csrfToken}
          onClose={closeAuthModal}
          onLogin={() => replaceAuthModal("/login")}
        />
      )}
    </>
  )
}

export default App
