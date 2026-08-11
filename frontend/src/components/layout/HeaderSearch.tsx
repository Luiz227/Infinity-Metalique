import { useEffect, useMemo, useState } from "react"
import { FileSearch, LayoutDashboard, LoaderCircle, Search, ShieldCheck, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { readJson } from "@/lib/api"
import { type Route, navigate } from "@/lib/router"
import type { PermissionKey, User } from "@/types"

type SearchResult = {
  id: string
  title: string
  subtitle: string
  route: Route
  tab: string | null
  type: string
}

const qualityLinks: Array<{ title: string; tab: string; permission: PermissionKey }> = [
  { title: "RAPs", tab: "raps", permission: "quality.raps" },
  { title: "Unidades", tab: "unidades", permission: "quality.units" },
  { title: "Produtos", tab: "produtos", permission: "quality.products" },
  { title: "Produtos Coletados", tab: "coletas", permission: "quality.dispatches" },
  { title: "Colaboradores", tab: "colaboradores", permission: "quality.employees" },
  { title: "Qualidade", tab: "qualidade", permission: "quality.satisfaction" },
  { title: "Registros", tab: "registros", permission: "quality.records" },
]

export function HeaderSearch({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR")

  const shortcuts = useMemo<SearchResult[]>(() => {
    const items: SearchResult[] = []
    if (user.permissions.includes("dashboard.view")) {
      items.push({ id: "route-dashboard", title: "Dashboard", subtitle: "Visão geral do sistema", route: "/sistema", tab: null, type: "Página" })
    }
    if (user.permissions.includes("quality.view")) {
      const permitted = qualityLinks.filter((item) => user.permissions.includes(item.permission))
      const links = permitted.length ? permitted : qualityLinks
      links.forEach((item) => items.push({ id: `route-quality-${item.tab}`, title: item.title, subtitle: "Módulo da Qualidade", route: "/qualidade", tab: item.tab, type: "Seção" }))
    }
    if (user.permissions.includes("users.manage")) {
      items.push({ id: "route-users", title: "Usuários", subtitle: "Contas e permissões", route: "/usuarios", tab: null, type: "Página" })
    }
    return items
  }, [user.permissions])

  useEffect(() => {
    const openWithKeyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", openWithKeyboard)
    return () => window.removeEventListener("keydown", openWithKeyboard)
  }, [])

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([])
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/backend/api/search.php?q=${encodeURIComponent(query.trim())}`, { credentials: "include" })
        const payload = await readJson<{ results: SearchResult[] }>(response)
        if (!cancelled) setResults(payload.results)
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query])

  const visibleShortcuts = normalizedQuery
    ? shortcuts.filter((item) => `${item.title} ${item.subtitle}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery))
    : shortcuts

  const openResult = (result: SearchResult) => {
    setOpen(false)
    setQuery("")
    navigate(result.route)
    if (result.tab) {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("metalique:quality-tab", { detail: result.tab })), 80)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}>
      <DialogTrigger asChild>
        <Button className="relative size-8 rounded-full bg-white p-0 text-black hover:bg-white/90 lg:size-[38px]" type="button" aria-label="Pesquisar" title="Pesquisar">
          <Search className="size-4 lg:size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Pesquisar no sistema</DialogTitle>
          <DialogDescription>Encontre páginas, usuários e registros.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 border-b border-black/10 px-5 py-4">
          <Search className="size-5 text-[#6e6c67]" />
          <input
            className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#898781]"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar RAP, produto coletado, usuário ou página..."
          />
          {isLoading && <LoaderCircle className="size-4 animate-spin text-[#db0f0f]" />}
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {!normalizedQuery && <p className="px-3 py-2 text-xs font-medium uppercase text-[#898781]">Acessos rápidos</p>}
          {visibleShortcuts.map((item) => (
            <button key={item.id} className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left hover:bg-neutral-100" type="button" onClick={() => openResult(item)}>
              {item.route === "/sistema" ? <LayoutDashboard className="size-5 text-[#db0f0f]" /> : item.route === "/usuarios" ? <Users className="size-5 text-[#db0f0f]" /> : <ShieldCheck className="size-5 text-[#db0f0f]" />}
              <span className="min-w-0 flex-1"><span className="block font-medium">{item.title}</span><span className="block truncate text-xs text-[#6e6c67]">{item.subtitle}</span></span>
              <span className="text-xs text-[#898781]">{item.type}</span>
            </button>
          ))}
          {results.length > 0 && <p className="mt-2 border-t border-black/10 px-3 pb-2 pt-4 text-xs font-medium uppercase text-[#898781]">Resultados</p>}
          {results.map((item) => (
            <button key={item.id} className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left hover:bg-neutral-100" type="button" onClick={() => openResult(item)}>
              <FileSearch className="size-5 text-[#db0f0f]" />
              <span className="min-w-0 flex-1"><span className="block font-medium">{item.title}</span><span className="block truncate text-xs text-[#6e6c67]">{item.subtitle || "Sem descrição"}</span></span>
              <span className="text-xs text-[#898781]">{item.type}</span>
            </button>
          ))}
          {normalizedQuery && !isLoading && visibleShortcuts.length === 0 && results.length === 0 && (
            <div className="grid min-h-32 place-items-center px-4 text-center text-sm text-[#6e6c67]">Nenhum resultado encontrado.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
