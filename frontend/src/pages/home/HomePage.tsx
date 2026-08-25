import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"

import { ContactDirectory } from "@/components/contact/ContactDirectory"
import { PublicPrimaryLink, PublicSecondaryLink, PublicShell } from "@/components/public/PublicShell"
import { postJson, profilePhotoUrl } from "@/lib/api"
import type { RememberedUser } from "@/lib/rememberedUser"
import { navigate, navigateHome, type HomeSection } from "@/lib/router"
import type { ApiResponse, HomeSummary, SummaryUser, User } from "@/types"

function TeamAvatar({ user }: { user: SummaryUser }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const photo = profilePhotoUrl(user.profile_photo)

  useEffect(() => {
    setFailed(false)
    setLoaded(false)
  }, [photo])

  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  // O anel é da cor da moldura e não do painel: ele existe para abrir um vão
  // entre um avatar e o seguinte, e o gradiente muda de tom ao longo do painel.
  const shared = "relative -ml-2 grid size-8 place-items-center overflow-hidden rounded-full bg-[#e6e6ea] text-[13px] font-semibold text-ink-soft ring-2 ring-frame first:ml-0"

  return (
    <span className={shared} title={user.name} role="img" aria-label={user.name}>
      <span aria-hidden="true">{initials || "U"}</span>
      {photo && !failed && (
        <img
          className={`absolute inset-0 size-full object-cover transition-opacity duration-150 ${loaded ? "opacity-100" : "opacity-0"}`}
          src={photo}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}

function sectionFromHash(): HomeSection {
  if (window.location.hash === "#ajuda") return "ajuda"
  if (window.location.hash === "#contato") return "contato"
  return "home"
}

const HOME_LEADS = [
  "Tecnologia própria que transforma possibilidades em soluções acessíveis para todos.",
  "Inovamos com ousadia para tornar a tecnologia de corte mais avançada, acessível e confiável.",
  "Cada máquina nasce do respeito às pessoas, da honestidade nos negócios e da busca incansável pela qualidade.",
  "Engenharia moderna, recursos aplicados com responsabilidade e qualidade que acompanha o cliente antes e depois da venda.",
  "Transformamos conhecimento em máquinas CNC plasma e laser que elevam a produtividade de quem confia em nosso trabalho.",
  "Ser referência começa todos os dias: ouvindo pessoas, criando com coragem e entregando com excelência.",
  "Tecnologia de ponta cumpre seu propósito quando combina desempenho, custo justo e confiança.",
  "Nossa ousadia cria o novo, nossa austeridade o torna sustentável e nossa qualidade faz cada resultado permanecer.",
  "Do projeto ao pós-venda, cada escolha carrega respeito, honestidade e compromisso com resultados.",
  "Democratizar a inovação é fazer tecnologia própria chegar mais longe, com qualidade e baixo custo.",
] as const

const HOME_LEAD_STORAGE_KEY = "infinity:last-home-lead"

function chooseHomeLead() {
  if (typeof window === "undefined") return HOME_LEADS[0]

  try {
    const previousLead = window.sessionStorage.getItem(HOME_LEAD_STORAGE_KEY)
    const availableLeads = HOME_LEADS.filter((lead) => lead !== previousLead)
    const nextLead = availableLeads[Math.floor(Math.random() * availableLeads.length)] || HOME_LEADS[0]
    window.sessionStorage.setItem(HOME_LEAD_STORAGE_KEY, nextLead)
    return nextLead
  } catch {
    return HOME_LEADS[Math.floor(Math.random() * HOME_LEADS.length)]
  }
}

const selectedHomeLead = chooseHomeLead()

const COPY: Record<HomeSection, { title: string; lead: string }> = {
  home: {
    title: "Venha fazer parte da equipe!",
    lead: selectedHomeLead,
  },
  ajuda: { title: "Ajuda", lead: "Área em desenvolvimento." },
  contato: { title: "Contato", lead: "Os ramais internos da Metalique e como falar com a gente." },
}

function greetingForCurrentTime() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return "Bom dia"
  if (hour >= 12 && hour < 18) return "Boa tarde"
  return "Boa noite"
}

function userCountLabel(total: number) {
  const count = Math.max(0, Math.floor(total))
  if (count === 1) return "1 Usuário"
  if (count < 10) return `${count} Usuários`
  return `${Math.floor(count / 10) * 10}+ Usuários`
}

export function HomePage({ user, rememberedUser, summary, csrfToken, onLogout, onForgetRememberedUser }: {
  user: User | null
  rememberedUser: RememberedUser | null
  summary: HomeSummary
  csrfToken: string
  onLogout: (csrfToken: string) => void
  onForgetRememberedUser: () => void
}) {
  const [activeSection, setActiveSection] = useState<HomeSection>(sectionFromHash)
  const [timeGreeting, setTimeGreeting] = useState(greetingForCurrentTime)
  const { total, users } = summary

  useEffect(() => {
    const updateSection = () => setActiveSection(sectionFromHash())
    window.addEventListener("popstate", updateSection)
    window.addEventListener("metalique:home-section", updateSection)

    return () => {
      window.removeEventListener("popstate", updateSection)
      window.removeEventListener("metalique:home-section", updateSection)
    }
  }, [])

  useEffect(() => {
    if (!user) return

    const updateGreeting = () => setTimeGreeting(greetingForCurrentTime())
    updateGreeting()
    const interval = window.setInterval(updateGreeting, 60_000)

    return () => window.clearInterval(interval)
  }, [user])

  const logout = async () => {
    const payload = await postJson<ApiResponse>("/backend/api/logout.php", { csrfToken })
    if (payload.csrfToken) onLogout(payload.csrfToken)
  }

  const firstName = user?.name.trim().split(/\s+/)[0] || ""
  const rememberedName = rememberedUser?.nickname?.trim()
    || rememberedUser?.name.trim().split(/\s+/)[0]
    || ""
  const copy = COPY[activeSection]
  // Contato não é herói: é uma tela de consulta, e a lista precisa da altura e da
  // largura inteiras do painel. O título encolhe junto, senão sobraria pouco
  // espaço para o que a pessoa veio buscar.
  const isContact = activeSection === "contato"
  const title = activeSection === "home"
    ? user
      ? `${timeGreeting}, ${firstName}!`
      : rememberedUser
        ? `Fazer login novamente como ${rememberedName}?`
        : copy.title
    : copy.title

  return (
    <PublicShell
      photo={{ src: "/images/figma-maquina.png", alt: "Máquina de corte a laser da Metalique" }}
      surface="metalique"
      fill={isContact}
      nav={[
        { label: "Home", active: activeSection === "home", onSelect: () => navigateHome("home") },
        { label: "Ajuda", active: activeSection === "ajuda", onSelect: () => navigateHome("ajuda") },
        { label: "Contato", active: activeSection === "contato", onSelect: () => navigateHome("contato") },
      ]}
      actions={user ? (
        <>
          <span className="hidden text-sm text-ink-soft sm:block">Olá, {firstName}</span>
          <button
            className="flex h-9 items-center rounded-full border border-metalique bg-transparent px-4 text-sm font-light text-metalique transition-colors hover:bg-metalique/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/15 lg:h-10 lg:px-5"
            type="button"
            onClick={() => void logout()}
          >
            Sair
          </button>
        </>
      ) : (
        <PublicSecondaryLink to="/login">Comece agora</PublicSecondaryLink>
      )}
    >
      {isContact ? (
        // A lista rola por dentro do painel: a seção da moldura é `overflow-hidden`,
        // então quem corre é o `Scroller` do próprio diretório. E há teto de
        // largura, como no herói: o gradiente fecha em vermelho forte à direita,
        // e a lista esticada até lá deixaria os cartões brancos boiando sobre a
        // parte mais escura.
        <div className="flex min-h-0 w-full flex-1 flex-col gap-5 p-7 sm:p-10 lg:max-w-[1040px] lg:p-14">
          <div aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${activeSection}:${title}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <h1 className="text-[clamp(28px,3vw,44px)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
                  {title}
                </h1>
                <p className="mt-2 text-[clamp(14px,1.1vw,17px)] font-light leading-snug text-ink-soft">{copy.lead}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <ContactDirectory variant="page" />
        </div>
      ) : (
      /* O hero mora embaixo à esquerda, e o `mt-auto` é quem o põe lá: assim
         ele desce junto com o painel em telas altas em vez de flutuar no meio. */
      <div className="mt-auto flex flex-col items-start gap-6 p-7 sm:p-10 lg:max-w-[62%] lg:p-14">
        <div aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${activeSection}:${title}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <h1 className="text-[clamp(30px,4.2vw,64px)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
                {title}
              </h1>
              <p className="mt-3 text-[clamp(15px,1.4vw,22px)] font-light leading-snug text-ink-soft">{copy.lead}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user ? (
            <button
              className="flex h-11 items-center rounded-full bg-metalique px-6 text-sm font-semibold text-white transition-colors hover:bg-metalique-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/20 lg:h-12 lg:px-7 lg:text-base"
              type="button"
              onClick={() => navigate("/sistema")}
            >
              Acessar sistema
            </button>
          ) : rememberedUser ? (
            <>
              <PublicPrimaryLink to="/solicitar-acesso">Solicitar acesso</PublicPrimaryLink>
              <PublicSecondaryLink to="/login">Fazer login</PublicSecondaryLink>
              <button
                className="flex h-11 items-center rounded-full px-2 text-sm font-light text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/15 lg:h-12 lg:text-base"
                type="button"
                onClick={onForgetRememberedUser}
              >
                Não sou este usuário
              </button>
            </>
          ) : (
            <>
              <PublicPrimaryLink to="/solicitar-acesso">Solicitar acesso</PublicPrimaryLink>
              <PublicSecondaryLink to="/login">Log-in</PublicSecondaryLink>
            </>
          )}
        </div>

        {users.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              {users.map((teamUser) => <TeamAvatar key={teamUser.id} user={teamUser} />)}
            </div>
            <small className="text-sm text-ink-soft">
              {userCountLabel(total)}
            </small>
          </div>
        )}
      </div>
      )}
    </PublicShell>
  )
}
