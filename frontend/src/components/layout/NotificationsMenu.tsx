import { useCallback, useEffect, useMemo, useState } from "react"
import { Bell, Check, CheckCheck, ClipboardList, KeyRound, LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Scroller } from "@/components/ui/scroller"
import { getJson, postJson } from "@/lib/api"
import { usePreferences } from "@/lib/preferences"
import { type Route, navigate } from "@/lib/router"
import type { User } from "@/types"

type Notification = {
  id: string
  title: string
  description: string
  createdAt: string
  route: Route
  tab: string | null
  kind?: "password-reset" | "access-request" | "quality"
  requestId?: number | null
}

export function NotificationsMenu({ user, csrfToken }: { user: User; csrfToken: string }) {
  const storageKey = `metalique:read-notifications:${user.id}`
  const { notificationsInterval } = usePreferences()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [decidingId, setDecidingId] = useState<number | null>(null)
  const [actionError, setActionError] = useState("")
  const [readIds, setReadIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]") as string[] } catch { return [] }
  })

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const payload = await getJson<{ notifications: Notification[] }>("/backend/api/notifications.php")
      setItems(payload.notifications)
    } catch {
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // A primeira carga acontece sempre; o intervalo é o que a conta escolheu, e
  // zero significa "só quando eu abrir" - ali não há timer nenhum rodando.
  useEffect(() => {
    void load()
    if (notificationsInterval <= 0) return

    const timer = window.setInterval(() => void load(), notificationsInterval * 1000)
    return () => window.clearInterval(timer)
  }, [load, notificationsInterval])
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(readIds)) }, [readIds, storageKey])

  // "Limpar marcas", nas configurações: as marcas de lido moram neste navegador,
  // então quem as apaga é esta tela, e não o servidor.
  useEffect(() => {
    const forgetReadMarks = () => setReadIds([])
    window.addEventListener("metalique:notifications-reset", forgetReadMarks)
    return () => window.removeEventListener("metalique:notifications-reset", forgetReadMarks)
  }, [])

  const unread = useMemo(() => items.filter((item) => !readIds.includes(item.id)).length, [items, readIds])
  const markAllRead = () => setReadIds(Array.from(new Set([...readIds, ...items.map((item) => item.id)])))

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) void load()
  }

  const openNotification = (item: Notification) => {
    setReadIds((current) => Array.from(new Set([...current, item.id])))
    changeOpen(false)
    navigate(item.route)
    if (item.tab) window.setTimeout(() => window.dispatchEvent(new CustomEvent("metalique:quality-tab", { detail: item.tab })), 80)
  }

  const decidePasswordReset = async (item: Notification, decision: "approve" | "reject") => {
    if (!item.requestId) return
    setDecidingId(item.requestId)
    setActionError("")
    try {
      await postJson<{ message: string }>("/backend/api/admin/password-reset-decision.php", {
        csrfToken,
        id: item.requestId,
        decision,
      })
      setReadIds((current) => Array.from(new Set([...current, item.id])))
      await load()
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Não foi possível analisar a solicitação.")
    } finally {
      setDecidingId(null)
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        {/* `shrink-0` porque no cabeçalho este botão é item flex: sem ele o sino
            encolheria junto quando a coluna aperta, em vez de o aperto ir todo
            para o campo de busca. */}
        {/* O anel do contador é da cor da moldura, não do vermelho: ele existe
            para abrir um vão entre a bolinha e a borda do sino, e sobre fundo
            claro quem faz esse vão é o branco. */}
        <Button className="relative size-[var(--header-control-size)] shrink-0 rounded-full border border-hairline bg-surface p-0 text-ink hover:bg-neutral-50" type="button" aria-label="Notificações" title="Notificações">
          <Bell className="size-4 lg:size-5" />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-metalique px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-frame">{Math.min(unread, 9)}{unread > 9 ? "+" : ""}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[min(380px,calc(100vw-2rem))] overflow-hidden">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div><h2 className="font-semibold">Notificações</h2><p className="text-xs text-ink-muted">Atualizações do sistema</p></div>
          {unread > 0 && <button className="flex items-center gap-1 text-xs font-medium text-metalique" type="button" onClick={markAllRead}><CheckCheck className="size-4" /> Marcar como lidas</button>}
        </div>
        <Scroller className="scroll-fade [--scroll-fade-size:1.5rem] max-h-[430px] overflow-y-auto" contentClassName="p-2">
          {actionError && <p className="m-2 rounded-md bg-red-50 p-3 text-xs text-red-700" role="alert">{actionError}</p>}
          {isLoading ? (
            <div className="grid h-32 place-items-center"><LoaderCircle className="size-5 animate-spin text-metalique" /></div>
          ) : items.length === 0 ? (
            <div className="grid h-36 place-items-center px-6 text-center text-sm text-ink-muted">Você não possui novas notificações.</div>
          ) : items.map((item) => {
            const isUnread = !readIds.includes(item.id)

            if (item.kind === "password-reset") {
              const isDeciding = decidingId === item.requestId
              return (
                <article key={item.id} className="relative flex gap-3 rounded-md px-3 py-3 hover:bg-neutral-50">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-metalique"><KeyRound className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{item.description}</p>
                    <p className="mt-1 text-[13px] text-ink-muted">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</p>
                    <div className="mt-3 flex gap-2">
                      <Button className="h-8 rounded-full px-3 text-xs" type="button" disabled={isDeciding} onClick={() => void decidePasswordReset(item, "approve")}>
                        {isDeciding ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Aceitar
                      </Button>
                      <Button className="h-8 rounded-full px-3 text-xs" variant="outline" type="button" disabled={isDeciding} onClick={() => void decidePasswordReset(item, "reject")}>
                        <X className="size-3.5" /> Recusar
                      </Button>
                    </div>
                  </div>
                  {isUnread && <span className="mt-2 size-2 shrink-0 rounded-full bg-metalique" aria-label="Não lida" />}
                </article>
              )
            }

            return (
              <button key={item.id} className="relative flex w-full gap-3 rounded-md px-3 py-3 text-left hover:bg-neutral-100" type="button" onClick={() => openNotification(item)}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-metalique"><ClipboardList className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.title}</span><span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{item.description}</span><span className="mt-1 block text-[13px] text-ink-muted">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</span></span>
                {isUnread && <span className="mt-2 size-2 shrink-0 rounded-full bg-metalique" aria-label="Não lida" />}
              </button>
            )
          })}
        </Scroller>
      </PopoverContent>
    </Popover>
  )
}
