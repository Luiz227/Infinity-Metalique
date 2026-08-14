import { useEffect, useRef, useState } from "react"
import { AppWindow, LoaderCircle } from "lucide-react"

type ExternalAppId = "piperun" | "sige"

const externalApps: Record<ExternalAppId, { url: string; partition: string }> = {
  piperun: { url: "https://app.pipe.run/v2/login", partition: "persist:piperun" },
  sige: { url: "https://app.sigecloud.com.br/Login.aspx", partition: "persist:sige" },
}

export function ExternalAppPage({ appId, name }: { appId: ExternalAppId; name: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const isDesktop = window.infinityDesktop?.isDesktop === true

  useEffect(() => {
    const host = hostRef.current
    if (!host || !isDesktop) return

    setIsLoading(true)

    const config = externalApps[appId]
    const webview = document.createElement("webview")
    const finishLoading = () => setIsLoading(false)

    webview.setAttribute("src", config.url)
    webview.setAttribute("partition", config.partition)
    webview.setAttribute("webpreferences", "contextIsolation=yes,nodeIntegration=no,sandbox=yes")
    webview.setAttribute("aria-label", name)
    webview.style.display = "flex"
    webview.style.width = "100%"
    webview.style.height = "100%"
    webview.style.minWidth = "0"
    webview.style.minHeight = "0"
    webview.addEventListener("did-stop-loading", finishLoading)
    webview.addEventListener("did-fail-load", finishLoading)
    host.appendChild(webview)

    return () => {
      webview.removeEventListener("did-stop-loading", finishLoading)
      webview.removeEventListener("did-fail-load", finishLoading)
      webview.remove()
    }
  }, [appId, isDesktop, name])

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-white">
      {isDesktop ? (
        <>
          <div ref={hostRef} className="size-full min-h-0 min-w-0 overflow-hidden" />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center gap-3 bg-white text-sm text-neutral-600">
              <LoaderCircle className="size-5 animate-spin text-[#db0f0f]" />
              Carregando {name}...
            </div>
          )}
        </>
      ) : (
        <div className="mx-6 max-w-md text-center">
          <AppWindow className="mx-auto size-10 text-[#db0f0f]" />
          <h1 className="mt-4 text-2xl font-semibold">{name} disponível no aplicativo desktop</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Execute o Infinity Desktop para visualizar e utilizar o {name} dentro deste painel.
          </p>
        </div>
      )}
    </div>
  )
}
