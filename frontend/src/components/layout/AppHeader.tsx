import { type ChangeEvent, type FormEvent, useEffect, useState } from "react"
import { Bell, Camera, ChevronDown, LoaderCircle, Search, UserRound, X } from "lucide-react"
import { motion } from "motion/react"

import { Button } from "@/components/ui/button"
import { postJson, profilePhotoUrl, readJson } from "@/lib/api"
import { AppLink, type Route, navigate } from "@/lib/router"
import type { ApiResponse, PermissionKey, User } from "@/types"

/** Itens da barra de navegação. Os que ainda não têm tela ficam como âncora. */
const navigation: { label: string; to?: Route; anchor?: string; permission?: PermissionKey }[] = [
  { label: "Dashboard", to: "/sistema", permission: "dashboard.view" },
  { label: "Qualidade", to: "/qualidade", permission: "quality.view" },
  { label: "Usuários", to: "/usuarios", permission: "users.manage" },
  { label: "Chamado", anchor: "#chamado" },
  { label: "KanBan", anchor: "#kanban" },
  { label: "Agenda", anchor: "#agenda" },
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
  onLogout: () => void
}) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [profileError, setProfileError] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [qualityTab, setQualityTab] = useState("raps")
  const [displayPhoto, setDisplayPhoto] = useState(() => profilePhotoUrl(user.profile_photo))
  const firstName = user.name.trim().split(/\s+/)[0] || "Usuário"
  const isQualityAccount = active === "/qualidade"
    && user.role !== "admin"
    && Array.isArray(user.permissions)
    && user.permissions.includes("quality.view")
    && !user.permissions.includes("dashboard.view")
    && !user.permissions.includes("users.manage")
  const hasQualitySections = qualityNavigation.some((item) => user.permissions?.includes(item.permission))
  const visibleQualityNavigation = hasQualitySections
    ? qualityNavigation.filter((item) => user.permissions.includes(item.permission))
    : qualityNavigation
  const visibleNavigation = navigation.filter((item) => (
    item.anchor
      ? !user.role || user.role === "admin"
      : !item.permission || !Array.isArray(user.permissions) || user.permissions.includes(item.permission)
  ))

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

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
      await postJson<ApiResponse>("/backend/api/logout.php", { csrfToken })
      onLogout()
    } finally {
      setIsLoggingOut(false)
    }
  }

  const selectPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    setSelectedPhoto(file)
    setProfileError("")
    setPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  const uploadPhoto = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedPhoto) return
    setIsUploading(true)
    setProfileError("")

    const formData = new FormData()
    formData.append("csrfToken", csrfToken)
    formData.append("profilePhoto", selectedPhoto)

    try {
      const response = await fetch("/backend/api/profile-photo.php", { method: "POST", credentials: "include", body: formData })
      const payload = await readJson<ApiResponse>(response)
      if (payload.user) {
        setDisplayPhoto(profilePhotoUrl(payload.user.profile_photo))
        onUserUpdated(payload.user)
      }
      setIsProfileOpen(false)
      setSelectedPhoto(null)
      setPreviewUrl(null)
    } catch (requestError) {
      setProfileError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <>
      {/* Três colunas com laterais de mesma largura mantêm o menu no centro do
          cabeçalho, independentemente do tamanho da logo e do bloco de perfil.
          Abaixo de lg o menu desce para uma linha própria. */}
      <header className="grid min-h-[82px] grid-cols-2 items-center gap-4 px-[5%] py-5 lg:min-h-[78px] lg:grid-cols-[1fr_auto_1fr] lg:px-[1%] lg:py-2">
        <AppLink className="flex shrink-0 items-center justify-self-start" to="/" ariaLabel="Metalique Infinity">
          <img className="h-auto w-[94px] lg:w-[150px]" src="/images/logo-b.svg" alt="Metalique Infinity" />
        </AppLink>

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
        </nav>

        <div className="flex shrink-0 items-center gap-2 justify-self-end sm:gap-3 lg:gap-[18px]">
          <Button className="size-8 rounded-full bg-white p-0 text-black hover:bg-white/90 lg:size-[38px]" type="button" aria-label="Buscar" title="Buscar"><Search className="size-4 lg:size-5" /></Button>
          <Button className="size-8 rounded-full bg-white p-0 text-black hover:bg-white/90 lg:size-[38px]" type="button" aria-label="Notificações" title="Notificações"><Bell className="size-4 lg:size-5" /></Button>

          <div className="flex items-center gap-2 text-white lg:gap-[7px]">
            <div className="hidden leading-none sm:block">
              <p className="text-[16px] font-medium leading-none lg:text-[21px]">{firstName}</p>
              <p className="mt-1 max-w-32 truncate text-[10px] font-light leading-none" title={user.job_title || "Colaborador"}>{user.job_title || "Colaborador"}</p>
            </div>
            <button className="relative size-11 overflow-hidden rounded-full border border-white bg-black lg:size-[60px]" type="button" onClick={() => setIsProfileOpen(true)} aria-label="Alterar foto de perfil" title="Alterar foto de perfil">
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
            <button className="hidden text-white sm:grid" type="button" onClick={() => void logout()} disabled={isLoggingOut} aria-label="Sair" title="Sair">
              {isLoggingOut ? <LoaderCircle className="size-4 animate-spin" /> : <ChevronDown className="size-4" />}
            </button>
          </div>
        </div>
      </header>

      {isProfileOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title">
          <section className="w-full max-w-md rounded-lg bg-white p-6 text-neutral-900 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <h2 id="profile-dialog-title" className="text-xl font-semibold">Foto de perfil</h2>
              <Button variant="ghost" size="icon" type="button" onClick={() => setIsProfileOpen(false)} aria-label="Fechar"><X /></Button>
            </div>
            <form className="mt-6 space-y-5" onSubmit={uploadPhoto}>
              <div className="mx-auto size-32 overflow-hidden rounded-full border-2 border-[#db0f0f] bg-neutral-100">
                {(previewUrl || displayPhoto) ? <img className="size-full object-cover" src={previewUrl || displayPhoto || ""} alt="Prévia da foto" /> : <span className="grid size-full place-items-center"><Camera className="size-9 text-neutral-400" /></span>}
              </div>
              {profileError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{profileError}</p>}
              <label className="block cursor-pointer rounded-md border border-[#db0f0f] px-4 py-3 text-center text-sm font-semibold text-[#db0f0f] hover:bg-red-50">
                Escolher imagem
                <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} />
              </label>
              <p className="text-center text-xs text-neutral-500">JPG, PNG ou WebP de até 5 MB.</p>
              <Button className="w-full rounded-full" type="submit" disabled={!selectedPhoto || isUploading}>
                {isUploading && <LoaderCircle className="animate-spin" />}
                {isUploading ? "Atualizando..." : "Atualizar foto"}
              </Button>
            </form>
          </section>
        </div>
      )}
    </>
  )
}
