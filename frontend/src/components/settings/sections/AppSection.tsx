import { useCallback, useEffect, useState } from "react"
import { Download, LoaderCircle, RefreshCw } from "lucide-react"

import { useDraftSection } from "@/components/settings/SettingsDraft"
import { SettingsFeedback, SettingsGroup, SettingsRow, SettingsSwitch } from "@/components/settings/SettingsRow"
import { Button } from "@/components/ui/button"
import { setPreference, usePreferences } from "@/lib/preferences"

const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.4]

const UPDATE_MESSAGES: Record<DesktopUpdateState["state"], string> = {
  idle: "Nenhuma verificação feita ainda.",
  disabled: "As atualizações automáticas não estão ativas nesta versão.",
  checking: "Procurando uma versão nova...",
  available: "Há uma versão nova para baixar.",
  downloading: "Baixando a atualização...",
  downloaded: "Atualização baixada. Reinicie para concluir.",
  error: "Não foi possível verificar as atualizações.",
}

/**
 * A seção que só existe dentro do Infinity Desktop. Ela é a única que fala com
 * o Electron, pelos canais expostos em `preload.cjs`.
 *
 * O zoom acompanha a preferência: ele é aplicado na janela assim que muda, para
 * a escolha ser vista, e volta sozinho no Descartar - quem desfaz o valor é o
 * store, e o efeito daqui só carrega a mudança até a janela. Abrir com o
 * Windows não tem o que pré-visualizar, então é rascunho puro: só vai ao
 * sistema no Salvar.
 *
 * Verificar atualização e instalar continuam imediatos: são ações, não ajustes.
 * Não há o que salvar depois - a atualização já baixou, ou já reiniciou.
 *
 * Uma instalação antiga carrega o frontend novo com um preload que ainda não
 * tinha `system`: por isso cada linha daqui confere o canal antes de aparecer.
 */
export function AppSection() {
  const desktop = window.infinityDesktop
  const preferences = usePreferences()
  const [info, setInfo] = useState<DesktopSystemInfo | null>(null)
  const [openAtLogin, setOpenAtLogin] = useState(false)
  const [status, setStatus] = useState<DesktopUpdateState | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!desktop?.system) return

    let active = true
    void desktop.system.getInfo()
      .then((next) => {
        if (!active) return
        setInfo(next)
        setOpenAtLogin(next.openAtLogin)
      })
      .catch(() => undefined)

    return () => { active = false }
  }, [desktop])

  // Leva o zoom escolhido até a janela. Vale tanto para a escolha nova quanto
  // para o Descartar, que devolve o valor anterior ao store.
  useEffect(() => {
    if (!desktop?.system || info === null) return
    void desktop.system.setZoom(preferences.zoomFactor).catch(() => undefined)
  }, [desktop, info, preferences.zoomFactor])

  useEffect(() => {
    const updates = desktop?.updates
    if (!updates) return

    let active = true
    const removeListener = updates.onStatus((next) => { if (active) setStatus(next) })
    void updates.getStatus().then((next) => { if (active) setStatus(next) }).catch(() => undefined)

    return () => {
      active = false
      removeListener()
    }
  }, [desktop])

  const save = useCallback(async () => {
    setError("")
    if (!desktop?.system) return
    try {
      setInfo(await desktop.system.setOpenAtLogin(openAtLogin))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível alterar a inicialização automática.")
      throw saveError
    }
  }, [desktop, openAtLogin])

  const discard = useCallback(() => {
    setOpenAtLogin(info?.openAtLogin ?? false)
    setError("")
  }, [info])

  useDraftSection({
    id: "app",
    isDirty: info !== null && openAtLogin !== info.openAtLogin,
    save,
    discard,
  })

  if (!desktop) return null

  const updateNow = async () => {
    setError("")
    try {
      if (status?.state === "downloaded") desktop.updates.install()
      else if (status?.state === "available") await desktop.updates.download()
      else await desktop.updates.check()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Não foi possível verificar as atualizações.")
    }
  }

  const isBusy = status?.state === "checking" || status?.state === "downloading"
  const updateActionLabel = status?.state === "downloaded"
    ? "Instalar e reiniciar"
    : status?.state === "available"
      ? "Baixar agora"
      : "Verificar agora"

  return (
    <div className="grid gap-5">
      <SettingsFeedback error={error} />

      <SettingsGroup title="Aplicativo">
        <SettingsRow
          label="Versão instalada"
          description={status?.state === "downloading" ? `Baixando: ${status.progress || 0}%` : UPDATE_MESSAGES[status?.state || "idle"]}
          control={
            <div className="flex items-center gap-3">
              <span className="text-sm tabular-nums text-ink-muted">{info?.version || status?.currentVersion || "—"}</span>
              <Button type="button" variant="outline" className="h-9 px-4 text-[13px]" disabled={isBusy} onClick={() => void updateNow()}>
                {isBusy ? <LoaderCircle className="animate-spin" /> : status?.state === "downloaded" ? <RefreshCw /> : <Download />}
                {updateActionLabel}
              </Button>
            </div>
          }
        />

        {info?.platform === "win32" && (
          <SettingsRow
            label="Abrir com o Windows"
            description="O Infinity inicia junto com o computador, já pronto para usar."
            deviceOnly
            control={
              <SettingsSwitch
                label="Abrir o Infinity com o Windows"
                checked={openAtLogin}
                onChange={setOpenAtLogin}
              />
            }
          />
        )}

        {desktop.system && (
          <SettingsRow
            label="Zoom da janela"
            description="Aumenta tudo de uma vez — texto, tabelas e gráficos. Útil em telas grandes e longe dos olhos."
            deviceOnly
            control={
              <div className="flex items-center gap-1 rounded-lg border border-hairline bg-neutral-50 p-1" role="radiogroup" aria-label="Zoom da janela">
                {ZOOM_STEPS.map((step) => {
                  const isActive = Math.abs(preferences.zoomFactor - step) < 0.001
                  return (
                    <button
                      key={step}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setPreference({ zoomFactor: step })}
                      className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/35 ${
                        isActive ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      {Math.round(step * 100)}%
                    </button>
                  )
                })}
              </div>
            }
          />
        )}
      </SettingsGroup>
    </div>
  )
}
