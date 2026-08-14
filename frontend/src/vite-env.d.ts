/// <reference types="vite/client" />

type DesktopUpdateState = {
  state: "idle" | "disabled" | "checking" | "available" | "downloading" | "downloaded" | "error"
  currentVersion: string
  productionRelease: boolean
  version?: string
  progress?: number
  error?: string
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
  }
}
