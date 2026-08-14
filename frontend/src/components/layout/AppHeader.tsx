import { useEffect, useState } from "react"
import { ChevronDown, LoaderCircle, LogOut, UserRound } from "lucide-react"
import { motion } from "motion/react"

import { HeaderSearch } from "@/components/layout/HeaderSearch"
import { NotificationsMenu } from "@/components/layout/NotificationsMenu"
import { ProfileDialog } from "@/components/layout/ProfileDialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { postJson, profilePhotoUrl } from "@/lib/api"
import { AppLink, type Route, navigate } from "@/lib/router"
import type { ApiResponse, PermissionKey, User } from "@/types"

/** Itens da barra de navegação. Os que ainda não têm tela ficam como âncora. */
const navigation: { label: string; to?: Route; anchor?: string; permission?: PermissionKey }[] = [
  { label: "Dashboard", to: "/sistema", permission: "dashboard.view" },
  { label: "Qualidade", to: "/qualidade", permission: "quality.view" },
  { label: "Usuários", to: "/usuarios", permission: "users.manage" },
  { label: "PipeRun", to: "/piperun", permission: "piperun.view" },
  { label: "SIGE", to: "/sige", permission: "sige.view" },
]

const qualityNavigation: { id: string; label: string; permission: PermissionKey }[] = [
  { id: "raps", label: "RAPs", permission: "quality.raps" },
  { id: "unidades", label: "Unidades", permission: "quality.units" },
  { id: "produtos", label: "Produtos", permission: "quality.products" },
  { id: "coletas", label: "Produtos Coletados", permission: "quality.dispatches" },
  { id: "colaboradores", label: "Colaboradores", permission: "quality.employees" },
  { id: "qualidade", label: "Qualidade", permission: "quality.satisfaction" },
  { id: "registros", label: "Registros", permission: "quality.records" },
]

function abbreviatedDisplayName(user: User) {
  const nameParts = user.name.trim().split(/\s+/).filter(Boolean)
  const preferredName = user.nickname?.trim() || nameParts[0] || "Usuário"
  const surname = nameParts.length > 1 ? nameParts.at(-1) : null

  return surname ? `${preferredName} ${surname.charAt(0).toLocaleUpperCase("pt-BR")}.` : preferredName
}

/**
 * Cabeçalho vermelho compartilhado pelas telas internas: navegação, foto de
 * perfil e saída. Estava embutido no dashboard e foi extraído para que a view
 * de qualidade não precisasse duplicá-lo.
 */
export function AppHeader({ user, csrfToken, active, onUserUpdated, onLogout }: {
  user: User
  csrfToken: string
  active: Route
  onUserUpdated: (user: User) => void
  onLogout: (csrfToken: string) => void
}) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isCompactHeader, setIsCompactHeader] = useState(() => window.matchMedia("(max-width: 1023px)").matches)
  const [qualityTab, setQualityTab] = useState("raps")
  const [displayPhoto, setDisplayPhoto] = useState(() => profilePhotoUrl(user.profile_photo))
  const displayName = abbreviatedDisplayName(user)
  const isQualityAccount = active === "/qualidade"
    && user.role !== "admin"
    && Array.isArray(user.permissions)
    && user.permissions.includes("quality.view")
    && !user.permissions.includes("dashboard.view")
    && !user.permissions.includes("users.manage")
    && !user.permissions.includes("piperun.view")
    && !user.permissions.includes("sige.view")
  const visibleQualityNavigation = qualityNavigation.filter((item) => user.permissions.includes(item.permission))
  const canCreateRap = user.role === "admin" || user.permissions.includes("quality.create_rap")
  const canCreateDispatch = user.role === "admin" || user.permissions.includes("quality.create_dispatch")
  const isActionOnlyQualityAccount = active === "/qualidade"
    && visibleQualityNavigation.length === 0
    && (canCreateRap || canCreateDispatch)
  const visibleNavigation = navigation.filter((item) => (
    user.role === "admin" || !item.permission || user.permissions.includes(item.permission)
  ))

  useEffect(() => setDisplayPhoto(profilePhotoUrl(user.profile_photo)), [user.profile_photo])

  useEffect(() => {
    const compactHeaderQuery = window.matchMedia("(max-width: 1023px)")
    const updateHeaderMode = () => setIsCompactHeader(compactHeaderQuery.matches)
    compactHeaderQuery.addEventListener("change", updateHeaderMode)
    return () => compactHeaderQuery.removeEventListener("change", updateHeaderMode)
  }, [])

  useEffect(() => {
    const updateQualityTab = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail
      if (typeof tab === "string") setQualityTab(tab)
    }
    window.addEventListener("metalique:quality-tab-changed", updateQualityTab)
    return () => window.removeEventListener("metalique:quality-tab-changed", updateQualityTab)
  }, [])

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
      {/* Laterais de mesma largura (`1fr auto 1fr`) põem o menu no centro exato
          do cabeçalho — e é esse esquema que faz a busca só empurrar quando
          realmente chega perto: enquanto a coluna da direita couber na metade
          dela, o campo cresce dentro do próprio vazio e o menu não se mexe;
          passando disso, ela toma da metade da esquerda e o menu anda o tanto
          que foi invadido, nem um pixel a mais.
          Centrar o menu na coluna do meio (`auto 1fr auto`) faria ele deslizar
          já no primeiro pixel de expansão, com o campo ainda longe.
          Quando o espaço acaba de vez quem cede é o campo de busca, não o menu
          (ver o `min-w` em HeaderSearch): o menu tem `overflow-x-auto`, ou seja
          mínimo zero, e seria ele a colapsar.
          Abaixo de lg o menu desce para uma linha própria. */}
      <header className="grid min-h-[82px] grid-cols-[auto_1fr] items-center gap-4 px-[5%] py-7 lg:min-h-[78px] lg:grid-cols-[1fr_auto_1fr] lg:px-[1%]">
        <AppLink className="flex shrink-0 items-center justify-self-start" to="/" ariaLabel="Metalique Infinity">
          {/* Altura casada com a da barra do menu (padding + py-2 + line-height
              do texto): 36px no mobile, 38px no sm e 46px no lg. */}
          <img className="h-9 w-auto sm:h-[38px] lg:h-[46px]" src="/images/logo-b.svg" alt="Metalique Infinity" />
        </AppLink>

        {/* Sem animação própria: o deslocamento sai da transição de largura do
            campo de busca, que reequilibra as colunas a cada frame. */}
        <nav
          className="order-last col-span-2 flex max-w-full items-center gap-1 justify-self-center overflow-x-auto rounded-full bg-white p-1 text-[12px] font-light text-black sm:text-sm lg:order-none lg:col-span-1 lg:p-[6px] lg:text-[18px]"
          aria-label="Navegação principal"
        >
          {isQualityAccount ? visibleQualityNavigation.map((item) => {
            const isActive = item.id === qualityTab
            return (
              <button
                key={item.id}
                className="relative whitespace-nowrap rounded-full px-3 py-2 leading-none lg:px-4"
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  setQualityTab(item.id)
                  window.dispatchEvent(new CustomEvent("metalique:quality-tab", { detail: item.id }))
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-[#db0f0f]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className={`relative z-10 ${isActive ? "text-white" : ""}`}>{item.label}</span>
              </button>
            )
          }) : visibleNavigation.map((item) => {
            const isActive = item.to === active
            const className = "relative whitespace-nowrap rounded-full px-3 py-2 leading-none lg:px-4"

            const content = (
              <>
                {/* Uma única pílula viaja entre os itens: o layoutId faz o motion
                    interpolar posição e largura entre um render e o outro. */}
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-[#db0f0f]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className={`relative z-10 ${isActive ? "text-white" : ""}`}>{item.label}</span>
              </>
            )

            return item.to ? (
              <a
                key={item.label}
                className={className}
                href={item.to}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => {
                  if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
                    event.preventDefault()
                    navigate(item.to!)
                  }
                }}
              >
                {content}
              </a>
            ) : (
              <a key={item.label} className={className} href={item.anchor}>{content}</a>
            )
          })}

          {isActionOnlyQualityAccount && canCreateDispatch && (
            <button
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#db0f0f] px-3 py-2 font-normal leading-none text-[#db0f0f] lg:px-4"
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("metalique:quality-open-form", { detail: "dispatch" }))}
            >
              <span>Nova coleta</span>
            </button>
          )}
          {isActionOnlyQualityAccount && canCreateRap && (
            <button
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#db0f0f] px-3 py-2 font-normal leading-none text-white lg:px-4"
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("metalique:quality-open-form", { detail: "rap" }))}
            >
              <span>Novo RAP</span>
            </button>
          )}
        </nav>

        {/* Sem `justify-self-end`: o bloco passa a ocupar a coluna inteira (o
            `justify-end` é que encosta o conteúdo na direita). Ocupando a
            coluna ele sente quando ela aperta, e repassa o aperto ao campo de
            busca — único filho sem `shrink-0`. */}
        <div className="flex items-center justify-end gap-2 sm:gap-3 lg:gap-[18px]">
          <HeaderSearch user={user} />
          <NotificationsMenu user={user} csrfToken={csrfToken} />

          <div className="flex shrink-0 items-center gap-2 text-white lg:gap-[7px]">
            <div className="hidden leading-none sm:block">
              <p className="text-[16px] font-medium leading-none lg:text-[21px]">{displayName}</p>
              <p className="mt-1 max-w-32 truncate text-[10px] font-light leading-none" title={user.job_title || "Colaborador"}>{user.job_title || "Colaborador"}</p>
            </div>
            <button className="relative size-11 overflow-hidden rounded-full border border-white bg-black lg:size-[60px]" type="button" onClick={() => setIsProfileOpen(true)} aria-label="Abrir perfil" title="Abrir perfil">
              {displayPhoto ? (
                <img
                  className="size-full object-cover"
                  src={displayPhoto}
                  alt={`Foto de ${user.name}`}
                  onError={() => setDisplayPhoto(null)}
                />
              ) : (
                <span className="grid size-full place-items-center bg-white text-[#db0f0f]">
                  <UserRound className="size-6 lg:size-8" />
                </span>
              )}
            </button>
            <Popover open={isAccountMenuOpen} onOpenChange={setIsAccountMenuOpen}>
              <PopoverTrigger asChild>
                <button className="grid text-white" type="button" disabled={isLoggingOut} aria-label="Abrir menu da conta" title="Menu da conta">
                  {isLoggingOut ? <LoaderCircle className="size-4 animate-spin" /> : <ChevronDown className={`size-4 transition-transform ${isAccountMenuOpen ? "rotate-180" : ""}`} />}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={isCompactHeader ? 76 : 12}
                avoidCollisions={!isCompactHeader}
                className="w-52 p-1.5"
              >
                <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-neutral-100" type="button" onClick={() => { setIsAccountMenuOpen(false); setIsProfileOpen(true) }}><UserRound className="size-4 text-[#db0f0f]" /> Perfil</button>
                <div className="my-1 border-t border-black/10" />
                <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#db0f0f] hover:bg-red-50" type="button" onClick={() => void logout()} disabled={isLoggingOut}><LogOut className="size-4" /> Sair do sistema</button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <ProfileDialog
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
        user={user}
        csrfToken={csrfToken}
        onUserUpdated={onUserUpdated}
      />
    </>
  )
}
