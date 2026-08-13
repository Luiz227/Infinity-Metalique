/// <reference types="vite/client" />

type DesktopViewBounds = {
  x: number
  y: number
  width: number
  height: number
}

interface Window {
  infinityDesktop?: {
    isDesktop: true
    showExternalApp: (appId: "piperun" | "sige", bounds: DesktopViewBounds) => Promise<boolean>
    resizeExternalApp: (appId: "piperun" | "sige", bounds: DesktopViewBounds) => void
    hideExternalApp: (appId: "piperun" | "sige") => void
  }
}
