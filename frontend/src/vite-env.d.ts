/// <reference types="vite/client" />

type DesktopUpdateState = {
  state: "idle" | "disabled" | "checking" | "available" | "downloading" | "downloaded" | "error"
  currentVersion: string
  productionRelease: boolean
  version?: string
  progress?: number
  error?: string
}

type DesktopSystemInfo = {
  version: string
  platform: string
  productionRelease: boolean
  openAtLogin: boolean
  zoomFactor: number
}

interface Window {
  infinityDesktop?: {
    isDesktop: true
    updates: {
      getStatus: () => Promise<DesktopUpdateState>
      check: () => Promise<DesktopUpdateState>
      download: () => Promise<DesktopUpdateState>
      install: () => void
      onStatus: (listener: (status: DesktopUpdateState) => void) => () => void
    }
    /** Opcional: uma instalação antiga do desktop carrega o frontend novo com
        um preload que ainda não expunha estes canais. */
    system?: {
      getInfo: () => Promise<DesktopSystemInfo>
      setOpenAtLogin: (openAtLogin: boolean) => Promise<DesktopSystemInfo>
      setZoom: (zoomFactor: number) => Promise<DesktopSystemInfo>
    }
  }
}
