import { type ReactNode } from "react"
import {
  BookOpen,
  ChevronDown,
  Folder,
  LoaderCircle,
  LogOut,
  Moon,
  Phone,
  Settings,
  UserRound,
} from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { resolveTheme, setPreference, usePreferences } from "@/lib/preferences"
import { hasPermission } from "@/lib/navigation"
import { navigate } from "@/lib/router"
import type { User } from "@/types"

type AccountMenuProps = {
  user: User
  displayPhoto: string | null
  open: boolean
  isLoggingOut: boolean
  onOpenChange: (open: boolean) => void
  onPhotoError: () => void
  onOpenSettings: () => void
  onOpenContact: () => void
  onLogout: () => void
}

const menuItemClass = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique"

function PlaceholderItem({ icon, label, description }: {
  icon: ReactNode
  label: string
  description?: string
}) {
  return (
    <div
      className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-ink-soft"
      aria-disabled="true"
      title={`${label}: disponível em breve`}
    >
      <span className="grid size-5 shrink-0 place-items-center text-ink-muted" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium leading-5 text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[12px] leading-4 text-ink-muted">{description}</span>}
      </span>
      <span className="shrink-0 rounded-full border border-hairline bg-neutral-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        Em breve
      </span>
    </div>
  )
}

export function AccountMenu({
  user,
  displayPhoto,
  open,
  isLoggingOut,
  onOpenChange,
  onPhotoError,
  onOpenSettings,
  onOpenContact,
  onLogout,
}: AccountMenuProps) {
  const preferences = usePreferences()
  // O atalho do menu segue a mesma preferência da central, e não um estado
  // próprio: com dois estados, mudar o tema por lá deixaria o interruptor daqui
  // mentindo até a próxima recarga. Com o tema em "sistema", ele mostra o que
  // está valendo agora e um clique escolhe o lado oposto explicitamente.
  const isDarkMode = resolveTheme(preferences.theme) === "dark"

  const toggleDarkMode = () => setPreference({ theme: isDarkMode ? "light" : "dark" })

  const openSettings = () => {
    onOpenChange(false)
    onOpenSettings()
  }

  const openContact = () => {
    onOpenChange(false)
    onOpenContact()
  }

  const openDocuments = () => {
    onOpenChange(false)
    navigate("/documentados")
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="group flex h-[var(--header-control-size)] shrink-0 items-center gap-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique"
          type="button"
          disabled={isLoggingOut}
          aria-label="Abrir menu do perfil"
          title="Menu do perfil"
        >
          <span className="relative size-[var(--header-control-size)] overflow-hidden rounded-full border border-hairline-strong bg-black">
            {displayPhoto ? (
              <img
                className="size-full object-cover"
                src={displayPhoto}
                alt=""
                onError={onPhotoError}
              />
            ) : (
              <span className="grid size-full place-items-center bg-surface text-metalique">
                <UserRound className="size-5 sm:size-6" />
              </span>
            )}
          </span>
          {isLoggingOut ? (
            <LoaderCircle className="size-4 animate-spin text-ink-soft" />
          ) : (
            <ChevronDown className={`size-4 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={12}
        collisionPadding={12}
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(22rem,calc(100vw-1.5rem))] overflow-x-hidden overflow-y-auto rounded-2xl bg-surface p-0 shadow-[0_20px_60px_rgb(11_11_11/0.18)]"
        aria-label="Opções do perfil"
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-hairline-strong bg-neutral-100 text-metalique">
            {displayPhoto ? (
              <img className="size-full object-cover" src={displayPhoto} alt="" onError={onPhotoError} />
            ) : (
              <UserRound className="size-6" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink" title={user.name}>{user.name}</span>
            <span className="mt-0.5 block truncate text-[13px] text-ink-muted" title={user.job_title || user.email}>
              {user.job_title || user.email}
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-hairline px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            {user.role === "admin" ? "Admin" : "Colab."}
          </span>
        </div>

        <div className="border-t border-hairline p-2">
          <button className={`${menuItemClass} hover:bg-neutral-100`} type="button" onClick={openSettings}>
            <Settings className="size-4.5 shrink-0 text-ink-muted" />
            <span className="flex-1 font-medium">Configurações</span>
          </button>
          <button
            className={`${menuItemClass} hover:bg-neutral-100`}
            type="button"
            role="switch"
            aria-checked={isDarkMode}
            onClick={toggleDarkMode}
          >
            <Moon className="size-4.5 shrink-0 text-ink-muted" />
            <span className="flex-1 font-medium">Modo escuro</span>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${isDarkMode ? "bg-metalique" : "bg-ink/20"}`}
              aria-hidden="true"
            >
              <span className={`block size-5 rounded-full bg-[#ffffff] shadow-sm transition-transform ${isDarkMode ? "translate-x-5" : "translate-x-0"}`} />
            </span>
          </button>
        </div>

        <div className="border-t border-hairline p-2">
          <button className={`${menuItemClass} hover:bg-neutral-100`} type="button" onClick={openContact}>
            <Phone className="size-4.5 shrink-0 text-ink-muted" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium leading-5 text-ink">Ramal</span>
              <span className="mt-0.5 block text-[12px] leading-4 text-ink-muted">Telefones internos da fábrica</span>
            </span>
          </button>
          <PlaceholderItem icon={<BookOpen className="size-4.5" />} label="Manual de máquinas" />
          {hasPermission(user, "documents.view") && (
            <button className={`${menuItemClass} hover:bg-neutral-100`} type="button" onClick={openDocuments}>
              <Folder className="size-4.5 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium leading-5 text-ink">Documentados</span>
                <span className="mt-0.5 block text-[12px] leading-4 text-ink-muted">Procedimentos, mapas, diagramas e organogramas</span>
              </span>
            </button>
          )}
        </div>

        <div className="border-t border-hairline p-2">
          <button
            className={`${menuItemClass} text-metalique hover:bg-metalique/[0.06] disabled:cursor-wait disabled:opacity-70`}
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? <LoaderCircle className="size-4.5 animate-spin" /> : <LogOut className="size-4.5" />}
            <span className="font-medium">{isLoggingOut ? "Saindo..." : "Sair do sistema"}</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
