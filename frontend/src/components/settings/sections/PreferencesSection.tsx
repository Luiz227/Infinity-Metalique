import type { ReactNode } from "react"
import { Monitor, Moon, Sun } from "lucide-react"

import { SettingsChoice, SettingsFeedback, SettingsGroup, SettingsRow, SettingsSwitch } from "@/components/settings/SettingsRow"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MAIN_NAVIGATION, QUALITY_NAVIGATION, hasPermission } from "@/lib/navigation"
import {
  type ColorTheme,
  type StartRoute,
  usePreferencesSaveError,
  setPreference,
  usePreferences,
} from "@/lib/preferences"
import type { User } from "@/types"

const THEME_CHOICES: { value: ColorTheme; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Claro", icon: <Sun className="size-4" /> },
  { value: "dark", label: "Escuro", icon: <Moon className="size-4" /> },
  { value: "system", label: "Sistema", icon: <Monitor className="size-4" /> },
]

/**
 * O jeito de usar o sistema: o que abre, quanto se mexe e o que o navegador
 * lembra. Nenhuma linha aqui é enfeite - cada uma muda algo que a pessoa sente
 * na tela seguinte.
 */
export function PreferencesSection({ user }: { user: User }) {
  const preferences = usePreferences()
  const saveError = usePreferencesSaveError()

  const allowedRoutes = MAIN_NAVIGATION.filter((item) => hasPermission(user, item.permission))
  const allowedQualityTabs = QUALITY_NAVIGATION.filter((item) => hasPermission(user, item.permission))
  // Uma tela inicial que a conta perdeu no meio do caminho não pode continuar
  // escolhida no seletor: ela mostraria um rótulo que não existe mais na lista.
  const startRoute: StartRoute = preferences.startRoute !== "auto"
    && !allowedRoutes.some((item) => item.to === preferences.startRoute)
    ? "auto"
    : preferences.startRoute

  return (
    <div className="grid gap-5">
      <SettingsFeedback error={saveError} />

      <SettingsGroup title="Aparência">
        <SettingsRow
          label="Tema"
          description="Escolha a aparência do Infinity. Em Sistema, ele acompanha o tema do Windows."
          control={
            <SettingsChoice
              label="Tema"
              value={preferences.theme}
              options={THEME_CHOICES}
              onChange={(theme) => setPreference({ theme })}
            />
          }
        />

        <SettingsRow
          label="Reduzir animações"
          description="Corta as transições e o deslize das abas. Ajuda em máquinas mais lentas."
          control={
            <SettingsSwitch
              label="Reduzir animações"
              checked={preferences.reduceMotion}
              onChange={(reduceMotion) => setPreference({ reduceMotion })}
            />
          }
        />

        <SettingsRow
          label="Rolagem suave"
          description="A inércia ao girar a roda do mouse. Desligada, a rolagem é a do navegador."
          control={
            <SettingsSwitch
              label="Rolagem suave"
              checked={preferences.smoothScroll}
              onChange={(smoothScroll) => setPreference({ smoothScroll })}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Ao entrar">
        <SettingsRow
          label="Tela inicial"
          description="Para onde o sistema leva você depois do login."
          htmlFor="settings-start-route"
          control={
            <Select value={startRoute} onValueChange={(value) => setPreference({ startRoute: value as StartRoute })}>
              <SelectTrigger id="settings-start-route" className="w-[min(16rem,60vw)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">A primeira que eu puder abrir</SelectItem>
                {allowedRoutes.map((item) => (
                  <SelectItem key={item.to} value={item.to}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        {allowedQualityTabs.length > 1 && (
          <SettingsRow
            label="Aba inicial da Qualidade"
            description="Qual aba do módulo já vem aberta."
            htmlFor="settings-quality-tab"
            control={
              <Select value={preferences.qualityTab} onValueChange={(qualityTab) => setPreference({ qualityTab })}>
                <SelectTrigger id="settings-quality-tab" className="w-[min(16rem,60vw)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedQualityTabs.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        )}
      </SettingsGroup>

      <SettingsGroup title="Este computador">
        <SettingsRow
          label="Lembrar meu usuário"
          description="Guarda seu nome e foto na tela de login para você só digitar a senha. Desligar apaga o que já está guardado."
          deviceOnly
          control={
            <SettingsSwitch
              label="Lembrar meu usuário neste computador"
              checked={preferences.rememberUser}
              onChange={(rememberUser) => setPreference({ rememberUser })}
            />
          }
        />
      </SettingsGroup>
    </div>
  )
}
