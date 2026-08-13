import { useEffect, useRef, useState } from "react"
import { AppWindow, LoaderCircle } from "lucide-react"

type ExternalAppId = "piperun" | "sige"

function viewBounds(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

export function ExternalAppPage({ appId, name }: { appId: ExternalAppId; name: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const desktop = window.infinityDesktop

  useEffect(() => {
    const host = hostRef.current
    if (!host || !desktop?.isDesktop) return

    let cancelled = false
    const showView = async () => {
      const shown = await desktop.showExternalApp(appId, viewBounds(host))
      if (!cancelled && shown) setIsLoading(false)
    }
    const resizeView = () => desktop.resizeExternalApp(appId, viewBounds(host))
    const observer = new ResizeObserver(resizeView)

    observer.observe(host)
    window.addEventListener("resize", resizeView)
    void showView()

    return () => {
      cancelled = true
      observer.disconnect()
      window.removeEventListener("resize", resizeView)
      desktop.hideExternalApp(appId)
    }
  }, [appId, desktop])

  return (
    <div ref={hostRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-white">
      {desktop?.isDesktop ? (
        isLoading && (
          <div className="flex items-center gap-3 text-sm text-neutral-600">
            <LoaderCircle className="size-5 animate-spin text-[#db0f0f]" />
            Carregando {name}...
          </div>
        )
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
