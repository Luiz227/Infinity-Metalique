import { useEffect, useRef } from "react"

import { getJson } from "@/lib/api"

const QUALITY_REVISION_POLL_MS = 5_000

type RevisionRef = { current: string | null }
type RevisionPayload = { revision: string }

/**
 * Observa uma revisão barata no servidor e pede uma carga completa somente
 * quando outro cliente realmente alterou os dados da Qualidade.
 */
export function useQualityLiveRefresh({
  endpoint,
  enabled = true,
  appliedRevisionRef,
  onRefresh,
}: {
  endpoint: string
  enabled?: boolean
  appliedRevisionRef: RevisionRef
  onRefresh: () => void
}) {
  const onRefreshRef = useRef(onRefresh)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    if (!enabled) return

    let stopped = false
    let timer: number | null = null
    let requestController: AbortController | null = null

    const canCheck = () => document.visibilityState === "visible" && navigator.onLine
    const schedule = () => {
      if (stopped) return
      timer = window.setTimeout(() => void check(), QUALITY_REVISION_POLL_MS)
    }
    const check = async () => {
      timer = null
      if (stopped) return
      if (!canCheck()) {
        schedule()
        return
      }

      const controller = new AbortController()
      requestController = controller

      try {
        const payload = await getJson<RevisionPayload>(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        })
        const appliedRevision = appliedRevisionRef.current

        if (appliedRevision !== null && payload.revision !== appliedRevision) {
          onRefreshRef.current()
        }
      } catch {
        // Falha de rede é transitória: a próxima rodada tenta novamente sem
        // substituir mensagens importantes da tela por um erro de sincronismo.
      } finally {
        if (requestController === controller) requestController = null
        schedule()
      }
    }
    const checkNow = () => {
      if (stopped || requestController !== null || !canCheck()) return
      if (timer !== null) window.clearTimeout(timer)
      timer = null
      void check()
    }
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") checkNow()
    }

    void check()
    document.addEventListener("visibilitychange", checkWhenVisible)
    window.addEventListener("focus", checkNow)
    window.addEventListener("pageshow", checkNow)
    window.addEventListener("online", checkNow)

    return () => {
      stopped = true
      if (timer !== null) window.clearTimeout(timer)
      requestController?.abort()
      document.removeEventListener("visibilitychange", checkWhenVisible)
      window.removeEventListener("focus", checkNow)
      window.removeEventListener("pageshow", checkNow)
      window.removeEventListener("online", checkNow)
    }
  }, [appliedRevisionRef, enabled, endpoint])
}
