import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { Bell, KeyRound, MonitorSmartphone, Phone, ShieldCheck, SlidersHorizontal, TriangleAlert, UserRound } from "lucide-react"

import { SettingsDraftProvider, useDraftSection, useSettingsDraft } from "@/components/settings/SettingsDraft"
import { SettingsSaveBar } from "@/components/settings/SettingsSaveBar"
import { AppSection } from "@/components/settings/sections/AppSection"
import { ContactSection } from "@/components/settings/sections/ContactSection"
import { DangerZoneSection } from "@/components/settings/sections/DangerZoneSection"
import { NotificationsSection } from "@/components/settings/sections/NotificationsSection"
import { PreferencesSection } from "@/components/settings/sections/PreferencesSection"
import { ProfileSection } from "@/components/settings/sections/ProfileSection"
import { SecuritySection } from "@/components/settings/sections/SecuritySection"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Scroller } from "@/components/ui/scroller"
import { profilePhotoUrl } from "@/lib/api"
import { hasPermission } from "@/lib/navigation"
import {
  beginPreferencesDraft,
  commitPreferencesDraft,
  discardPreferencesDraft,
  endPreferencesDraft,
  usePreferencesDraftDirty,
} from "@/lib/preferences"
import { QualitySettingsPanel } from "@/pages/quality/QualitySettingsPanel"
import { cn } from "@/lib/utils"
import type { User } from "@/types"

export type SettingsSectionId =
  | "perfil" | "seguranca" | "preferencias" | "notificacoes" | "qualidade" | "ramais" | "app" | "zona-de-perigo"

type SectionDefinition = {
  id: SettingsSectionId
  group: string
  label: string
  title: string
  description: string
  icon: ReactNode
  isVisible: (user: User) => boolean
}

/**
 * As seções na ordem em que aparecem na barra lateral. Os grupos saem daqui: a
 * lateral só agrupa o que a lista já declara, então acrescentar uma seção é
 * acrescentar uma linha.
 */
const SECTIONS: SectionDefinition[] = [
  {
    id: "perfil",
    group: "Conta",
    label: "Perfil",
    title: "Perfil",
    description: "Sua foto, seu nome e como o sistema te chama.",
    icon: <UserRound className="size-4" />,
    isVisible: () => true,
  },
  {
    id: "seguranca",
    group: "Conta",
    label: "Segurança",
    title: "Segurança",
    description: "A senha que abre o Infinity.",
    icon: <KeyRound className="size-4" />,
    isVisible: () => true,
  },
  {
    id: "preferencias",
    group: "Sistema",
    label: "Preferências",
    title: "Preferências",
    description: "Escolha a aparência e o comportamento do Infinity.",
    icon: <SlidersHorizontal className="size-4" />,
    isVisible: () => true,
  },
  {
    id: "notificacoes",
    group: "Sistema",
    label: "Notificações",
    title: "Notificações",
    description: "O que o sino avisa e de quanto em quanto tempo.",
    icon: <Bell className="size-4" />,
    isVisible: () => true,
  },
  {
    id: "app",
    group: "Sistema",
    label: "Aplicativo",
    title: "Aplicativo",
    description: "A janela do Infinity Desktop nesta máquina.",
    icon: <MonitorSmartphone className="size-4" />,
    // Só dentro do Electron: no navegador não há janela nem instalação a ajustar.
    isVisible: () => Boolean(window.infinityDesktop?.isDesktop),
  },
  {
    id: "qualidade",
    group: "Administração",
    label: "Qualidade",
    title: "Configurações da Qualidade",
    description: "Gates, códigos e a meta mensal de RAPs.",
    icon: <ShieldCheck className="size-4" />,
    isVisible: (user) => hasPermission(user, "quality.manage"),
  },
  {
    id: "ramais",
    group: "Administração",
    label: "Ramais",
    title: "Ramais e contatos",
    description: "Os telefones internos e os canais que a aba Contato mostra.",
    icon: <Phone className="size-4" />,
    isVisible: (user) => hasPermission(user, "contact.manage"),
  },
  {
    id: "zona-de-perigo",
    group: "Administração",
    label: "Zona de perigo",
    title: "Zona de perigo",
    description: "Esvaziar de vez as abas do sistema. As tabelas continuam; os dados não.",
    icon: <TriangleAlert className="size-4" />,
    // Cargo, e não permissão: apagar um setor não é coisa que se conceda a
    // alguém pela tela de permissões. O servidor confere o mesmo.
    isVisible: (user) => user.role === "admin",
  },
]

type SettingsDialogProps = {
  open: boolean
  section: SettingsSectionId
  user: User
  csrfToken: string
  onOpenChange: (open: boolean) => void
  onSectionChange: (section: SettingsSectionId) => void
  onUserUpdated: (user: User) => void
}

export function SettingsDialog(props: SettingsDialogProps) {
  // O provedor fica por fora do diálogo porque quem decide se ele pode fechar
  // já precisa saber se há rascunho pendente.
  return (
    <SettingsDraftProvider>
      <SettingsDialogBody {...props} />
    </SettingsDraftProvider>
  )
}

/**
 * As preferências não têm rascunho local: quem guarda o antes e o depois é o
 * próprio store, porque a mudança precisa aparecer na tela na hora (escolher um
 * tema sem ver o tema é escolher no escuro). Aqui ele só entra no registro,
 * como qualquer seção - e entra no nível do diálogo porque o rascunho é um só
 * para Preferências e Notificações, que dividem o mesmo store.
 */
function usePreferencesDraftRegistration() {
  const isDirty = usePreferencesDraftDirty()

  useDraftSection({
    id: "preferencias",
    isDirty,
    save: commitPreferencesDraft,
    discard: discardPreferencesDraft,
  })
}

/**
 * A central de configurações: barra lateral de seções à esquerda, painel
 * rolável à direita e a barra de salvamento atravessando o rodapé.
 *
 * Nada aqui grava sozinho. Qualquer mudança vira rascunho, a barra aparece, e
 * só o Salvar dela desce para o disco e para o banco - inclusive o que já
 * apareceu na tela, como o tema. Enquanto houver pendência o modal não fecha.
 *
 * Abaixo de `md` a lateral vira uma fila horizontal no topo: numa tela estreita
 * duas colunas deixariam o painel sem largura para as linhas.
 */
function SettingsDialogBody({ open, section, user, csrfToken, onOpenChange, onSectionChange, onUserUpdated }: SettingsDialogProps) {
  const visibleSections = useMemo(() => SECTIONS.filter((item) => item.isVisible(user)), [user])
  const groups = useMemo(() => [...new Set(visibleSections.map((item) => item.group))], [visibleSections])
  const active = visibleSections.find((item) => item.id === section) || visibleSections[0]
  const photo = profilePhotoUrl(user.profile_photo)

  const { isDirty, save, discard } = useSettingsDraft()
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [attention, setAttention] = useState(0)
  // Uma seção só monta depois de visitada, e daí em diante não desmonta mais: é
  // o que permite trocar de seção sem perder o rascunho das outras, sem pagar
  // por requisições de seções que ninguém abriu.
  const [visited, setVisited] = useState<SettingsSectionId[]>([])

  usePreferencesDraftRegistration()

  useEffect(() => {
    if (open) beginPreferencesDraft()
  }, [open])

  useEffect(() => {
    if (open && active) setVisited((current) => (current.includes(active.id) ? current : [...current, active.id]))
  }, [active, open])

  // Uma seção que a conta perdeu (ou que só existe no desktop) não pode ficar
  // escolhida: o painel abriria vazio.
  useEffect(() => {
    if (open && active && active.id !== section) onSectionChange(active.id)
  }, [active, onSectionChange, open, section])

  const close = useCallback(() => {
    endPreferencesDraft()
    setVisited([])
    setSaveError("")
    setAttention(0)
    onOpenChange(false)
  }, [onOpenChange])

  const requestClose = useCallback((next: boolean) => {
    if (next) {
      onOpenChange(true)
      return
    }
    // Fechar com pendência não descarta em silêncio: a barra sacode e continua
    // ali, porque a escolha entre salvar e descartar é de quem mexeu.
    if (isDirty) {
      setAttention((current) => current + 1)
      return
    }
    close()
  }, [close, isDirty, onOpenChange])

  const runSave = useCallback(async () => {
    setIsSaving(true)
    setSaveError("")
    const failedSectionId = await save()
    setIsSaving(false)

    if (failedSectionId) {
      // A falha aponta o dedo: leva para a seção que recusou, onde a mensagem
      // detalhada está.
      const failed = visibleSections.find((item) => item.id === failedSectionId)
      if (failed) onSectionChange(failed.id)
      setSaveError(failed
        ? `Não foi possível salvar: veja o que ${failed.label} está pedindo.`
        : "Não foi possível salvar as alterações.")
      return
    }

    // Salvar não fecha: quem abriu a central pode ter mais o que ajustar. A
    // barra some sozinha, porque não sobrou nada pendente.
    setAttention(0)
  }, [onSectionChange, save, visibleSections])

  const runDiscard = useCallback(() => {
    discard()
    setSaveError("")
    setAttention(0)
  }, [discard])

  if (!active) return null

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        className="flex h-[min(680px,calc(100dvh-2rem))] w-[calc(100%-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0"
        showCloseButton={!isSaving}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>Perfil, preferências e ajustes do sistema.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* A lateral tem fundo próprio para separar do painel sem precisar de
              uma segunda linha ao lado da borda. */}
          <nav
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-hairline bg-neutral-50 p-2 md:w-60 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-3"
            aria-label="Seções das configurações"
          >
            <div className="hidden items-center gap-3 px-2 pb-3 pt-1 md:flex">
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-hairline-strong bg-neutral-100 text-metalique">
                {photo ? <img className="size-full object-cover" src={photo} alt="" /> : <UserRound className="size-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink" title={user.name}>{user.name}</span>
                <span className="block truncate text-[12px] text-ink-muted" title={user.email}>{user.email}</span>
              </span>
            </div>

            {groups.map((group) => (
              <div key={group} className="contents md:block">
                <p className="hidden px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted md:block">
                  {group}
                </p>
                {visibleSections.filter((item) => item.group === group).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={item.id === active.id ? "page" : undefined}
                    onClick={() => onSectionChange(item.id)}
                    className={cn(
                      "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/35 md:w-full",
                      item.id === active.id
                        ? "bg-surface font-medium text-ink shadow-sm"
                        : "text-ink-soft hover:bg-surface/70 hover:text-ink",
                    )}
                  >
                    <span className={item.id === active.id ? "text-metalique" : "text-ink-muted"}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* O cartão tem fundo próprio: a máscara vai no corpo, nunca nele. */}
          <Scroller
            className="scroll-fade [--scroll-fade-size:1.5rem] flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
            contentClassName="px-6 py-6 md:px-8"
          >
            {visibleSections.filter((item) => visited.includes(item.id)).map((item) => (
              <div key={item.id} hidden={item.id !== active.id}>
                <header className="pb-5">
                  <h2 className="text-2xl font-semibold leading-tight text-ink">{item.title}</h2>
                  <p className="mt-1 text-sm text-ink-muted">{item.description}</p>
                </header>

                {item.id === "perfil" && <ProfileSection user={user} csrfToken={csrfToken} onUserUpdated={onUserUpdated} />}
                {item.id === "seguranca" && <SecuritySection csrfToken={csrfToken} />}
                {item.id === "preferencias" && <PreferencesSection user={user} />}
                {item.id === "notificacoes" && <NotificationsSection user={user} />}
                {item.id === "app" && <AppSection />}
                {item.id === "qualidade" && <QualitySettingsPanel csrfToken={csrfToken} />}
                {item.id === "ramais" && <ContactSection csrfToken={csrfToken} />}
                {item.id === "zona-de-perigo" && <DangerZoneSection csrfToken={csrfToken} />}
              </div>
            ))}
          </Scroller>
        </div>

        <SettingsSaveBar
          visible={isDirty}
          isSaving={isSaving}
          error={saveError}
          attention={attention}
          onSave={() => void runSave()}
          onDiscard={runDiscard}
        />
      </DialogContent>
    </Dialog>
  )
}
