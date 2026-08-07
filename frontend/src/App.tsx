import { useEffect, useState } from "react"
import { LoaderCircle } from "lucide-react"

import { getJson } from "@/lib/api"
import { type Route, currentRoute, navigate } from "@/lib/router"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { HomePage } from "@/pages/home/HomePage"
import { LoginPage } from "@/pages/login/LoginPage"
import { AccessRequestPage } from "@/pages/access-request/AccessRequestPage"
import type { ApiResponse, User } from "@/types"

function App() {
  const [route, setRoute] = useState<Route>(currentRoute())
  const [csrfToken, setCsrfToken] = useState("")
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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
    if (!isLoading && route === "/sistema" && !user) {
      navigate("/login", true)
    }
  }, [isLoading, route, user])

  useEffect(() => {
    const titles: Record<Route, string> = {
      "/": "Metalique Infinity",
      "/login": "Login | Metalique Infinity",
      "/solicitar-acesso": "Solicitar acesso | Metalique Infinity",
      "/sistema": "Dashboard | Metalique Infinity",
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

  if (route === "/sistema" && user) {
    return (
      <DashboardPage
        user={user}
        csrfToken={csrfToken}
        onUserUpdated={setUser}
        onLogout={() => {
          setUser(null)
          navigate("/")
        }}
      />
    )
  }

  return <HomePage user={user} csrfToken={csrfToken} onLogout={() => setUser(null)} />
}

export default App
