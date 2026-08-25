import { useCallback, useState } from "react"

import { useDraftSection } from "@/components/settings/SettingsDraft"
import { SettingsFeedback, SettingsGroup, SettingsRow, SettingsSwitch } from "@/components/settings/SettingsRow"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { hasPermission } from "@/lib/navigation"
import { type NotificationKind, usePreferencesSaveError, setPreference, usePreferences } from "@/lib/preferences"
import type { User } from "@/types"

/** Os três tipos que o sino sabe emitir, com quem enxerga cada um. */
const KINDS: { kind: NotificationKind; label: string; description: string; adminOnly?: boolean }[] = [
  {
    kind: "quality",
    label: "Novos registros da Qualidade",
    description: "Quando outra pessoa lança um RAP.",
  },
  {
    kind: "access-request",
    label: "Solicitações de acesso",
    description: "Quando alguém pede uma conta no sistema.",
    adminOnly: true,
  },
  {
    kind: "password-reset",
    label: "Pedidos de nova senha",
    description: "Quando alguém esquece a senha e precisa da sua autorização.",
    adminOnly: true,
  },
]

const INTERVAL_LABELS: Record<number, string> = {
  30: "A cada 30 segundos",
  120: "A cada 2 minutos",
  0: "Só quando eu abrir o sino",
}

export function NotificationsSection({ user }: { user: User }) {
  const preferences = usePreferences()
  const saveError = usePreferencesSaveError()
  // As marcas de lido moram no navegador, não no store das preferências, então
  // elas têm rascunho próprio: o botão marca a intenção e o Salvar da barra é
  // que apaga. Sem isso, "Limpar" seria a única coisa irreversível do modal.
  const [willClearReadMarks, setWillClearReadMarks] = useState(false)
  const visibleKinds = KINDS.filter((item) => (
    item.adminOnly ? user.role === "admin" : hasPermission(user, "quality.view")
  ))

  const toggleKind = (kind: NotificationKind, wanted: boolean) => {
    const muted = preferences.mutedNotifications.filter((item) => item !== kind)
    setPreference({ mutedNotifications: wanted ? muted : [...muted, kind].sort() })
  }

  useDraftSection({
    id: "notificacoes",
    isDirty: willClearReadMarks,
    save: useCallback(async () => {
      window.dispatchEvent(new CustomEvent("metalique:notifications-reset"))
      setWillClearReadMarks(false)
    }, []),
    discard: useCallback(() => setWillClearReadMarks(false), []),
  })

  return (
    <div className="grid gap-5">
      <SettingsFeedback error={saveError} />

      <SettingsGroup
        title="O que aparece no sino"
        description="O filtro é aplicado no servidor, então o contador do sino nunca conta o que você silenciou."
      >
        {visibleKinds.length === 0 ? (
          <p className="py-4 text-sm text-ink-muted">
            Sua conta ainda não recebe notificações. Elas aparecem aqui assim que você ganhar acesso a um módulo que
            as emite.
          </p>
        ) : visibleKinds.map((item) => (
          <SettingsRow
            key={item.kind}
            label={item.label}
            description={item.description}
            control={
              <SettingsSwitch
                label={item.label}
                checked={!preferences.mutedNotifications.includes(item.kind)}
                onChange={(wanted) => toggleKind(item.kind, wanted)}
              />
            }
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="Frequência">
        <SettingsRow
          label="Verificar novidades"
          description="De quanto em quanto tempo o sino consulta o servidor sozinho. Abrir o sino sempre atualiza na hora."
          htmlFor="settings-notifications-interval"
          control={
            <Select
              value={String(preferences.notificationsInterval)}
              onValueChange={(value) => setPreference({ notificationsInterval: Number(value) })}
            >
              <SelectTrigger id="settings-notifications-interval" className="w-[min(16rem,60vw)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(INTERVAL_LABELS).map(([seconds, label]) => (
                  <SelectItem key={seconds} value={seconds}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Histórico de leitura">
        <SettingsRow
          label="Marcas de lido"
          description={willClearReadMarks
            ? "Serão limpas ao salvar: todas as notificações voltam a aparecer como novas."
            : "Quais notificações já foram vistas fica guardado neste computador. Limpar faz todas voltarem a aparecer como novas."}
          deviceOnly
          control={
            <Button
              type="button"
              variant="outline"
              className="h-9 px-4 text-[13px]"
              onClick={() => setWillClearReadMarks((current) => !current)}
            >
              {willClearReadMarks ? "Não limpar" : "Limpar marcas"}
            </Button>
          }
        />
      </SettingsGroup>
    </div>
  )
}
