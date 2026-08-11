import { useCallback, useEffect, useMemo, useState } from "react"
import { Bell, Check, CheckCheck, ClipboardList, KeyRound, LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getJson, postJson } from "@/lib/api"
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

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => window.clearInterval(timer)
  }, [load])
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(readIds)) }, [readIds, storageKey])

  const unread = useMemo(() => items.filter((item) => !readIds.includes(item.id)).length, [items, readIds])
  const markAllRead = () => setReadIds(Array.from(new Set([...readIds, ...items.map((item) => item.id)])))

  const openNotification = (item: Notification) => {
    setReadIds((current) => Array.from(new Set([...current, item.id])))
    setOpen(false)
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
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void load() }}>
      <PopoverTrigger asChild>
        <Button className="relative size-8 rounded-full bg-white p-0 text-black hover:bg-white/90 lg:size-[38px]" type="button" aria-label="Notificações" title="Notificações">
          <Bell className="size-4 lg:size-5" />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-[#db0f0f] px-1 text-[9px] font-semibold leading-4 text-white ring-2 ring-[#db0f0f]">{Math.min(unread, 9)}{unread > 9 ? "+" : ""}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[min(380px,calc(100vw-2rem))] overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
          <div><h2 className="font-semibold">Notificações</h2><p className="text-xs text-[#6e6c67]">Atualizações do sistema</p></div>
          {unread > 0 && <button className="flex items-center gap-1 text-xs font-medium text-[#db0f0f]" type="button" onClick={markAllRead}><CheckCheck className="size-4" /> Marcar como lidas</button>}
        </div>
        <div className="max-h-[430px] overflow-y-auto p-2">
          {actionError && <p className="m-2 rounded-md bg-red-50 p-3 text-xs text-red-700" role="alert">{actionError}</p>}
          {isLoading ? (
            <div className="grid h-32 place-items-center"><LoaderCircle className="size-5 animate-spin text-[#db0f0f]" /></div>
          ) : items.length === 0 ? (
            <div className="grid h-36 place-items-center px-6 text-center text-sm text-[#6e6c67]">Você não possui novas notificações.</div>
          ) : items.map((item) => {
            const isUnread = !readIds.includes(item.id)

            if (item.kind === "password-reset") {
              const isDeciding = decidingId === item.requestId
              return (
                <article key={item.id} className="relative flex gap-3 rounded-md px-3 py-3 hover:bg-neutral-50">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-[#db0f0f]"><KeyRound className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#6e6c67]">{item.description}</p>
                    <p className="mt-1 text-[11px] text-[#898781]">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</p>
                    <div className="mt-3 flex gap-2">
                      <Button className="h-8 rounded-full px-3 text-xs" type="button" disabled={isDeciding} onClick={() => void decidePasswordReset(item, "approve")}>
                        {isDeciding ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Aceitar
                      </Button>
                      <Button className="h-8 rounded-full px-3 text-xs" variant="outline" type="button" disabled={isDeciding} onClick={() => void decidePasswordReset(item, "reject")}>
                        <X className="size-3.5" /> Recusar
                      </Button>
                    </div>
                  </div>
                  {isUnread && <span className="mt-2 size-2 shrink-0 rounded-full bg-[#db0f0f]" aria-label="Não lida" />}
                </article>
              )
            }

            return (
              <button key={item.id} className="relative flex w-full gap-3 rounded-md px-3 py-3 text-left hover:bg-neutral-100" type="button" onClick={() => openNotification(item)}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-[#db0f0f]"><ClipboardList className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.title}</span><span className="mt-0.5 block text-xs leading-relaxed text-[#6e6c67]">{item.description}</span><span className="mt-1 block text-[11px] text-[#898781]">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</span></span>
                {isUnread && <span className="mt-2 size-2 shrink-0 rounded-full bg-[#db0f0f]" aria-label="Não lida" />}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
