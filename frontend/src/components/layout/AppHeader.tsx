import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { motion } from "motion/react"

import { ContactDialog } from "@/components/contact/ContactDialog"
import { AccountMenu } from "@/components/layout/AccountMenu"
import { HeaderSearch } from "@/components/layout/HeaderSearch"
import { NotificationsMenu } from "@/components/layout/NotificationsMenu"
import { SettingsDialog, type SettingsSectionId } from "@/components/settings/SettingsDialog"
import { postJson, profilePhotoUrl } from "@/lib/api"
import { MAIN_NAVIGATION, QUALITY_NAVIGATION } from "@/lib/navigation"
import { currentPreferences } from "@/lib/preferences"
import { AppLink, type Route, navigate } from "@/lib/router"
import { scrollElementTo, useSmoothScroll } from "@/lib/smoothScroll"
import { useHorizontalOverflow } from "@/lib/useHorizontalOverflow"
import type { ApiResponse, User } from "@/types"

function abbreviatedDisplayName(user: User) {
  const nameParts = user.name.trim().split(/\s+/).filter(Boolean)
  const preferredName = user.nickname?.trim() || nameParts[0] || "Usuário"
  const surname = nameParts.length > 1 ? nameParts.at(-1) : null

  return surname ? `${preferredName} ${surname.charAt(0).toLocaleUpperCase("pt-BR")}.` : preferredName
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Cabeçalho compartilhado pelas telas internas: navegação, foto de perfil e
 * saída. Estava embutido no dashboard e foi extraído para que a view de
 * qualidade não precisasse duplicá-lo.
 *
 * Mora sobre a moldura branca, então tudo aqui é tinta escura sobre claro. As
 * pílulas brancas (menu, busca, notificações) só existem por causa do hairline:
 * sem a linha elas sumiriam dentro da moldura, que é branca também.
 */
export function AppHeader({ user, csrfToken, active, onUserUpdated, onLogout }: {
  user: User
  csrfToken: string
  active: Route
  onUserUpdated: (user: User) => void
  onLogout: (csrfToken: string) => void
}) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("perfil")
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isContactOpen, setIsContactOpen] = useState(false)
  const [qualityTab, setQualityTab] = useState(() => currentPreferences().qualityTab)
  const [displayPhoto, setDisplayPhoto] = useState(() => profilePhotoUrl(user.profile_photo))
  const headerRef = useRef<HTMLElement>(null)
  const brandRef = useRef<HTMLAnchorElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const navContentRef = useRef<HTMLDivElement | null>(null)
  const navHasOverflow = useHorizontalOverflow(navRef)
  const hasCenteredOnce = useRef(false)
  const displayName = abbreviatedDisplayName(user)
  const isQualityAccount = active === "/qualidade"
    && user.role !== "admin"
    && Array.isArray(user.permissions)
    && user.permissions.includes("quality.view")
    && !user.permissions.includes("dashboard.view")
    && !user.permissions.includes("documents.view")
    && !user.permissions.includes("users.manage")
    && !user.permissions.includes("piperun.view")
    && !user.permissions.includes("sige.view")
  const visibleQualityNavigation = QUALITY_NAVIGATION.filter((item) => user.permissions.includes(item.permission))
  const canCreateRap = user.role === "admin" || user.permissions.includes("quality.create_rap")
  const canCreateDispatch = user.role === "admin" || user.permissions.includes("quality.create_dispatch")
  const isActionOnlyQualityAccount = active === "/qualidade"
    && visibleQualityNavigation.length === 0
    && (canCreateRap || canCreateDispatch)
  const visibleNavigation = MAIN_NAVIGATION.filter((item) => (
    user.role === "admin" || user.permissions.includes(item.permission)
  ))

  useEffect(() => setDisplayPhoto(profilePhotoUrl(user.profile_photo)), [user.profile_photo])

  useEffect(() => {
    const updateQualityTab = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail
      if (typeof tab === "string") setQualityTab(tab)
    }
    window.addEventListener("metalique:quality-tab-changed", updateQualityTab)
    return () => window.removeEventListener("metalique:quality-tab-changed", updateQualityTab)
  }, [])

  // A central é única, mas se abre de vários lugares - o menu do perfil e a
  // engrenagem da Qualidade, por enquanto. O evento evita que quem quer abri-la
  // precise de um caminho até este estado.
  useEffect(() => {
    const openSettings = (event: Event) => {
      const requested = (event as CustomEvent<SettingsSectionId | undefined>).detail
      if (requested) setSettingsSection(requested)
      setIsSettingsOpen(true)
    }
    window.addEventListener("metalique:open-settings", openSettings)
    return () => window.removeEventListener("metalique:open-settings", openSettings)
  }, [])

  // Publica no cabeçalho a maior das duas laterais para que a grade dê o mesmo
  // mínimo às duas colunas 1fr (ver `.app-header` em base.css). Roda antes da
  // pintura: com a variável ainda em zero as laterais sairiam espremidas por um
  // quadro. Não há realimentação porque nenhuma coluna fica menor do que a
  // largura natural do bloco que mora nela, então ninguém é espremido e a
  // medida se estabiliza no primeiro ciclo.
  useLayoutEffect(() => {
    const header = headerRef.current
    const brand = brandRef.current
    const actions = actionsRef.current
    if (!header || !brand || !actions) return

    const syncSide = () => {
      const side = Math.max(brand.offsetWidth, actions.offsetWidth)
      header.style.setProperty("--header-side", `${Math.ceil(side)}px`)
    }

    const observer = new ResizeObserver(syncSide)
    observer.observe(brand)
    observer.observe(actions)
    syncSide()
    return () => observer.disconnect()
  }, [])



  // Move só o menu, e não `item.scrollIntoView`: o scrollIntoView sobe a árvore
  // e arrastaria o painel inteiro junto. O helper garante que o Lenis do menu
  // saiba do deslocamento - um `scrollLeft` escrito por fora seria desfeito por
  // ele no quadro seguinte.
  const centerActiveTab = useCallback((behavior: ScrollBehavior) => {
    const nav = navRef.current
    // A aba ativa vem do DOM, e não de um ref guardado. `ref={isActive ? ... }`
    // num componente do motion não reata quando a condição vira: o callback só
    // roda na montagem, e o ref ficava preso na primeira aba para sempre - a
    // barra voltava ao início a cada troca em vez de centralizar. O `aria-current`
    // que já marca a aba ativa para leitores de tela serve de fonte única.
    const item = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !item) return

    scrollElementTo(nav, item.offsetLeft + item.offsetWidth / 2 - nav.clientWidth / 2, {
      immediate: behavior === "auto",
      axis: "horizontal",
    })
  }, [])

  const activeTabKey = isQualityAccount ? qualityTab : active

  // A primeira vez é instantânea: o menu já nasce na posição certa em vez de
  // deslizar sozinho assim que a tela abre.
  useEffect(() => {
    const isFirstRun = !hasCenteredOnce.current
    hasCenteredOnce.current = true
    centerActiveTab(isFirstRun || prefersReducedMotion() ? "auto" : "smooth")
  }, [activeTabKey, centerActiveTab])

  // Encolher o menu (janela menor, busca aberta) reposiciona sem animação: o
  // deslize suave brigaria com o arrasto do usuário quadro a quadro. O primeiro
  // disparo, na montagem, já deixa a aba ativa centrada.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const observer = new ResizeObserver(() => centerActiveTab("auto"))
    observer.observe(nav)
    return () => observer.disconnect()
  }, [centerActiveTab])

  // A roda do mouse só gira na vertical, e o Chromium não traduz isso para a
  // horizontal aqui: o menu tem `overflow-y: auto` (imposto pelo overflow-x),
  // mas nenhum trilho vertical, então o giro vazaria inteiro e o menu ficaria
  // parado. Quem faz essa tradução agora é o Lenis - com orientação horizontal,
  // o padrão de `gestureOrientation` já é `"both"`, que é exatamente isto: o
  // giro vertical vira deslocamento lateral. Ele também normaliza deltas em
  // linhas e páginas, que antes precisavam de conversão à mão.
  //
  // `overscroll` fica ligado (ao contrário do padrão daqui) para preservar o
  // comportamento antigo nas pontas: sem nada para onde ir, o giro volta a ser
  // da página em vez de ficar preso num menu parado.
  useSmoothScroll(navRef, navContentRef, { orientation: "horizontal", overscroll: true })

  const logout = async () => {
    setIsLoggingOut(true)
    try {
      const payload = await postJson<ApiResponse>("/backend/api/logout.php", { csrfToken })
      if (payload.csrfToken) onLogout(payload.csrfToken)
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <>
      {/* Três colunas a partir de lg, com as duas laterais recebendo o mesmo
          mínimo — o `grid-template-columns` mora em `.app-header` (base.css)
          porque depende da variável medida em JS. Colunas laterais iguais põem
          o menu no centro exato do cabeçalho em qualquer largura, e quem cede
          espaço é sempre ele: tem `overflow-x-auto`, ou seja mínimo zero, então
          encolhe e rola por dentro em vez de deslizar para o lado.
          Centrar o menu na coluna do meio (`auto 1fr auto`) faria ele andar
          junto com qualquer mudança de largura da direita.
          Em larguras menores ele permanece na mesma linha e rola dentro da
          coluna central, sem aumentar a altura do cabeçalho. */}
      <header ref={headerRef} className="app-header header-stack header-sizing grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-[20px] sm:gap-4">
        <AppLink ref={brandRef} className="col-start-1 row-start-1 flex shrink-0 items-center justify-self-start" to="/" ariaLabel="Metalique Infinity">
          {/* A altura vem do mesmo token responsivo das pílulas do menu.
              `logo.svg` e não `logo-b.svg`: o -b é a versão branca, que existia
              para o cabeçalho vermelho e ficaria invisível na moldura clara.
              Mesmo viewBox nos dois, então nenhuma medida muda. */}
          <img className="h-[var(--header-control-size)] w-auto" src="/images/logo.svg" alt="Metalique Infinity" />
        </AppLink>

        {/* `relative` para o `offsetLeft` dos itens ser medido a partir daqui, e
            `layoutScroll` para o motion descontar o `scrollLeft` ao mover a
            pílula: sem ele a pílula erra a posição depois de rolar. */}
        <motion.nav
          layoutScroll
          layoutId="infinity-header-nav"
          ref={navRef}
          className="nav-scroller relative col-start-2 row-start-1 min-w-0 max-w-full justify-self-center overflow-x-auto rounded-full text-[14px] font-light text-ink sm:text-sm lg:text-sm"
          initial={false}
          animate={{
            backgroundColor: navHasOverflow ? "var(--header-nav-overflow-bg)" : "var(--header-nav-idle-bg)",
            boxShadow: navHasOverflow
              ? "var(--header-nav-overflow-shadow)"
              : "var(--header-nav-idle-shadow)",
          }}
          transition={{
            layout: { type: "spring", stiffness: 280, damping: 30, mass: 0.8 },
            backgroundColor: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
            boxShadow: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
          }}
          aria-label="Navegação principal"
        >
          {/* A faixa de abas ganhou um nível porque o Lenis exige um elemento de
              conteúdo por dentro do que rola. `w-max` é o que faz essa caixa
              valer a largura das abas, e não a do menu: é assim que ela
              transborda e cria a rolagem. As abas continuam sendo filhas de um
              flex, então nem o espaçamento nem a medição do motion mudam. */}
          <div ref={navContentRef} className="flex w-max items-center gap-1.5 lg:gap-2">
          {isQualityAccount ? visibleQualityNavigation.map((item) => {
            const isActive = item.id === qualityTab
            return (
              <motion.button
                key={item.id}
                layout="position"
                className={`relative flex h-[var(--header-control-size)] shrink-0 items-center whitespace-nowrap rounded-full border px-3 leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique lg:px-4 ${
                  isActive
                    ? "border-transparent text-metalique"
                    : "border-hairline bg-transparent text-ink-soft hover:border-hairline-strong hover:bg-surface hover:text-ink"
                }`}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  setQualityTab(item.id)
                  window.dispatchEvent(new CustomEvent("metalique:quality-tab", { detail: item.id }))
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="infinity-header-active-tab"
                    className="absolute inset-0 rounded-full border border-metalique bg-metalique/[0.04]"
                    transition={{ type: "spring", stiffness: 280, damping: 30, mass: 0.8 }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </motion.button>
            )
          }) : visibleNavigation.map((item) => {
            const isActive = item.to === active
            const className = `relative flex h-[var(--header-control-size)] shrink-0 items-center whitespace-nowrap rounded-full border px-3 leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique lg:px-4 ${
              isActive
                ? "border-transparent text-metalique"
                : "border-hairline bg-transparent text-ink-soft hover:border-hairline-strong hover:bg-surface hover:text-ink"
            }`

            return (
              <motion.a
                key={item.label}
                layout="position"
                className={className}
                href={item.to}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => {
                  if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
                    event.preventDefault()
                    navigate(item.to)
                  }
                }}
              >
                {/* Uma única pílula viaja entre os itens: o layoutId faz o motion
                    interpolar posição e largura entre um render e o outro. */}
                {isActive && (
                  <motion.span
                    layoutId="infinity-header-active-tab"
                    className="absolute inset-0 rounded-full border border-metalique bg-metalique/[0.04]"
                    transition={{ type: "spring", stiffness: 280, damping: 30, mass: 0.8 }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </motion.a>
            )
          })}

          {isActionOnlyQualityAccount && canCreateDispatch && (
            <motion.button
              layout="position"
              className="flex h-[var(--header-control-size)] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-metalique px-3 font-normal leading-none text-metalique focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique lg:px-4"
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("metalique:quality-open-form", { detail: "dispatch" }))}
            >
              <span>Nova coleta</span>
            </motion.button>
          )}
          {isActionOnlyQualityAccount && canCreateRap && (
            <motion.button
              layout="position"
              className="flex h-[var(--header-control-size)] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-metalique px-3 font-normal leading-none text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique lg:px-4"
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("metalique:quality-open-form", { detail: "rap" }))}
            >
              <span>Novo RAP</span>
            </motion.button>
          )}
          </div>
        </motion.nav>

        {/* `justify-self-end` para o bloco valer exatamente o próprio conteúdo:
            é essa largura que a medição publica em `--header-side`, e um bloco
            esticado devolveria a largura da coluna — a medida realimentaria a
            si mesma. Nada aqui cede espaço; quem cede é o menu. */}
        <div ref={actionsRef} className="col-start-3 row-start-1 flex items-center justify-end gap-2 justify-self-end sm:gap-3 lg:gap-[18px]">
          <HeaderSearch user={user} />
          <NotificationsMenu user={user} csrfToken={csrfToken} />

          <div className="flex shrink-0 items-center gap-2 text-ink lg:gap-[7px]">
            <div className="hidden leading-none sm:block">
              {/* Com teto: é a última medida sem limite do bloco, e um nome
                  longo faria a lateral passar de metade do cabeçalho. */}
              <p className="max-w-40 truncate text-[16px] font-medium leading-none lg:text-[21px]">{displayName}</p>
              <p className="mt-1 max-w-32 truncate text-[12px] font-light leading-none text-ink-muted" title={user.job_title || "Colaborador"}>{user.job_title || "Colaborador"}</p>
            </div>
            <AccountMenu
              user={user}
              displayPhoto={displayPhoto}
              open={isAccountMenuOpen}
              isLoggingOut={isLoggingOut}
              onOpenChange={setIsAccountMenuOpen}
              onPhotoError={() => setDisplayPhoto(null)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenContact={() => setIsContactOpen(true)}
              onLogout={() => void logout()}
            />
          </div>
        </div>
      </header>

      <SettingsDialog
        open={isSettingsOpen}
        section={settingsSection}
        user={user}
        csrfToken={csrfToken}
        onOpenChange={setIsSettingsOpen}
        onSectionChange={setSettingsSection}
        onUserUpdated={onUserUpdated}
      />

      <ContactDialog open={isContactOpen} onOpenChange={setIsContactOpen} />
    </>
  )
}
