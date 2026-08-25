import { useEffect, useState } from "react"
import { Download, LoaderCircle, RefreshCw, X } from "lucide-react"

export function DesktopUpdateNotice() {
  const updates = window.infinityDesktop?.updates
  const [status, setStatus] = useState<DesktopUpdateState | null>(null)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")

  useEffect(() => {
    if (!updates) return

    let active = true
    const removeListener = updates.onStatus((nextStatus) => {
      if (active) setStatus(nextStatus)
    })

    void updates.getStatus()
      .then((nextStatus) => { if (active) setStatus(nextStatus) })
      .catch(() => undefined)

    return () => {
      active = false
      removeListener()
    }
  }, [updates])

  if (!updates || !status || !status.productionRelease) return null
  if (!status.version || dismissedVersion === status.version) return null
  if (!(["available", "downloading", "downloaded"] as DesktopUpdateState["state"][]).includes(status.state)) return null

  const downloading = status.state === "downloading"
  const downloaded = status.state === "downloaded"

  const update = async () => {
    setActionError("")
    try {
      if (downloaded) updates.install()
      else await updates.download()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível baixar a atualização.")
    }
  }

  return (
    <aside className="fixed bottom-5 right-5 z-[100] w-[min(390px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-hairline bg-white text-black shadow-2xl" role="status" aria-live="polite">
      <div className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-metalique">
          {downloading ? <LoaderCircle className="size-5 animate-spin" /> : downloaded ? <RefreshCw className="size-5" /> : <Download className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{downloaded ? "Atualização pronta" : "Nova versão disponível"}</p>
          <p className="mt-1 text-sm leading-5 text-neutral-600">
            {downloaded
              ? `A versão ${status.version} foi baixada. Reinicie para concluir a instalação.`
              : `Atualize da versão ${status.currentVersion} para ${status.version}.`}
          </p>
          {downloading && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
                <div className="h-full rounded-full bg-metalique transition-[width]" style={{ width: `${status.progress || 0}%` }} />
              </div>
              <p className="mt-1 text-xs text-neutral-500">Baixando: {status.progress || 0}%</p>
            </div>
          )}
          {actionError && <p className="mt-2 text-xs text-red-700">{actionError}</p>}
          {!downloading && (
            <button className="mt-3 rounded-full bg-metalique px-4 py-2 text-sm font-semibold text-white hover:bg-metalique-strong" type="button" onClick={() => void update()}>
              {downloaded ? "Instalar e reiniciar" : "Atualizar agora"}
            </button>
          )}
        </div>
        {!downloading && !downloaded && (
          <button className="grid size-7 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100" type="button" aria-label="Lembrar depois" title="Lembrar depois" onClick={() => setDismissedVersion(status.version || null)}>
            <X className="size-4" />
          </button>
        )}
      </div>
    </aside>
  )
}
