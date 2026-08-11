import { useEffect, useState } from "react"

import { getJson, postJson, profilePhotoUrl } from "@/lib/api"
import { AppLink, navigate } from "@/lib/router"
import type { ApiResponse, SummaryUser, User } from "@/types"

function TeamAvatar({ user }: { user: SummaryUser }) {
  const [failed, setFailed] = useState(false)
  const photo = profilePhotoUrl(user.profile_photo)
  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  if (!photo || failed) {
    return <span className="team-avatar" title={user.name}>{initials || "U"}</span>
  }

  return <img src={photo} alt={user.name} title={user.name} onError={() => setFailed(true)} />
}

export function HomePage({
  user,
  csrfToken,
  onLogout,
}: {
  user: User | null
  csrfToken: string
  onLogout: () => void
}) {
  const [activeSection, setActiveSection] = useState<"home" | "ajuda" | "contato">("home")
  const [total, setTotal] = useState(0)
  const [users, setUsers] = useState<SummaryUser[]>([])

  useEffect(() => {
    getJson<ApiResponse>("/backend/api/summary.php")
      .then((payload) => {
        setTotal(payload.total || 0)
        setUsers(payload.users || [])
      })
      .catch(() => {
        setTotal(0)
        setUsers([])
      })
  }, [])

  const logout = async () => {
    await postJson<ApiResponse>("/backend/api/logout.php", { csrfToken })
    onLogout()
  }

  const firstName = user?.name.trim().split(/\s+/)[0] || ""
  const userLabel = total === 1 ? "1 Usuário" : `${total} Usuários`

  return (
    <main className="page-frame home-frame">
      <section className="home-visual" aria-label="Apresentação da Metalique Infinity">
        <div className="machine-window">
          <img className="machine-image" src="/images/figma-maquina.png" alt="Máquina de corte a laser da Metalique" />
        </div>

        <header className="top-navigation">
          <AppLink className="brand-link" to="/" ariaLabel="Página inicial">
            <img src="/images/logo-b.svg" alt="Metalique Infinity" />
          </AppLink>
          <nav className="navigation-links" aria-label="Navegação principal">
            <a className={activeSection === "home" ? "active" : undefined} href="/" onClick={(event) => { event.preventDefault(); setActiveSection("home") }}>Home</a>
            <a className={activeSection === "ajuda" ? "active" : undefined} href="#ajuda" onClick={(event) => { event.preventDefault(); setActiveSection("ajuda") }}>Ajuda</a>
            <a className={activeSection === "contato" ? "active" : undefined} href="#contato" onClick={(event) => { event.preventDefault(); setActiveSection("contato") }}>Contato</a>
          </nav>
        </header>

        <div className="team-card">
          <img className="team-card-shape" src="/images/figma-equipe-card.svg" alt="" aria-hidden="true" />
          <div className="team-summary">
            {users.map((teamUser) => (
              <TeamAvatar key={teamUser.id} user={teamUser} />
            ))}
            <small>{userLabel}</small>
          </div>
          <p className="team-message">Venha fazer<br />parte da equipe!</p>
          <a className="round-arrow" href="#contato" aria-label="Conheça a equipe" onClick={(event) => { event.preventDefault(); setActiveSection("contato") }}>
            <img src="/images/figma-seta.svg" alt="" />
          </a>
        </div>
      </section>

      <section className="home-content">
        <div className="access-links">
          {user ? (
            <>
              <span className="outline-button user-label">Olá, {firstName}</span>
              <button className="solid-button" type="button" onClick={() => void logout()}>Sair</button>
            </>
          ) : (
            <>
              <AppLink className="outline-button" to="/solicitar-acesso">Solicitar acesso</AppLink>
              <AppLink className="solid-button" to="/login">Log-in</AppLink>
            </>
          )}
        </div>

        <div className={`hero-copy${activeSection === "home" ? "" : " development-copy"}`} aria-live="polite">
          {activeSection === "home" ? (
            <>
              <h1>A integração Metalique chegou para simplificar</h1>
              <p>E deixar seus processos infinitamente melhor!</p>
            </>
          ) : (
            <>
              <h1>{activeSection === "ajuda" ? "Ajuda" : "Contato"}</h1>
              <p>Área em desenvolvimento.</p>
            </>
          )}
        </div>

        <div className="red-lines" aria-hidden="true">
          <img src="/images/figma-linha-1.svg" alt="" />
          <img src="/images/figma-linha-2.svg" alt="" />
          <img src="/images/figma-linha-3.svg" alt="" />
        </div>

        <button className="start-button" type="button" onClick={() => navigate(user ? "/sistema" : "/login")}>
          {user ? "Acessar sistema" : "Comece agora!"}
        </button>
      </section>
    </main>
  )
}
