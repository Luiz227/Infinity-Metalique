import { useEffect, useMemo, useRef, useState } from "react"
import { AppWindow, FileSearch, LayoutDashboard, LoaderCircle, Search, ShieldCheck, Users, X } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  const [isExpanded, setIsExpanded] = useState(false)
  // Abaixo de lg o menu desce para a segunda linha e a primeira fica só com
  // logo e perfil, sem folga para um campo de ~288px: ali o ícone abre o
  // diálogo em vez de expandir.
  const [canExpandInline, setCanExpandInline] = useState(() => window.matchMedia("(min-width: 1024px)").matches)
  const [inlineQuery, setInlineQuery] = useState("")
  const [query, setQuery] = useState("")
  const inlineInputRef = useRef<HTMLInputElement>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const normalizedInlineQuery = inlineQuery.trim().toLocaleLowerCase("pt-BR")
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR")

  const shortcuts = useMemo<SearchResult[]>(() => {
    const items: SearchResult[] = []
    const hasPermission = (permission: PermissionKey) => (
      user.role === "admin" || user.permissions.includes(permission)
    )

    if (hasPermission("dashboard.view")) {
      items.push({ id: "route-dashboard", title: "Dashboard", subtitle: "Visão geral do sistema", route: "/sistema", tab: null, type: "Página" })
    }
    if (hasPermission("quality.view")) {
      const permitted = qualityLinks.filter((item) => hasPermission(item.permission))
      const links = permitted.length ? permitted : qualityLinks
      links.forEach((item) => items.push({ id: `route-quality-${item.tab}`, title: item.title, subtitle: "Módulo da Qualidade", route: "/qualidade", tab: item.tab, type: "Seção" }))
    }
    if (hasPermission("users.manage")) {
      items.push({ id: "route-users", title: "Usuários", subtitle: "Contas e permissões", route: "/usuarios", tab: null, type: "Página" })
    }
    if (hasPermission("piperun.view")) {
      items.push({ id: "route-piperun", title: "PipeRun", subtitle: "CRM de vendas", route: "/piperun", tab: null, type: "Sistema externo" })
    }
    if (hasPermission("sige.view")) {
      items.push({ id: "route-sige", title: "SIGE", subtitle: "ERP online", route: "/sige", tab: null, type: "Sistema externo" })
    }
    return items
  }, [user.permissions, user.role])

  const inlineSuggestions = useMemo(() => {
    if (!normalizedInlineQuery) return []

    return shortcuts
      .filter((item) => item.title.toLocaleLowerCase("pt-BR").includes(normalizedInlineQuery))
      .sort((first, second) => {
        const firstStartsWithQuery = first.title.toLocaleLowerCase("pt-BR").startsWith(normalizedInlineQuery)
        const secondStartsWithQuery = second.title.toLocaleLowerCase("pt-BR").startsWith(normalizedInlineQuery)
        return Number(secondStartsWithQuery) - Number(firstStartsWithQuery)
      })
  }, [normalizedInlineQuery, shortcuts])

  useEffect(() => {
    const openWithKeyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setIsExpanded(false)
        setInlineQuery("")
        setOpen(true)
      }
    }
    window.addEventListener("keydown", openWithKeyboard)
    return () => window.removeEventListener("keydown", openWithKeyboard)
  }, [])

  useEffect(() => {
    const wideHeaderQuery = window.matchMedia("(min-width: 1024px)")
    const updateSearchMode = () => {
      setCanExpandInline(wideHeaderQuery.matches)
      // Sem isso, encolher a janela com a busca aberta deixaria o campo largo
      // numa linha que não o comporta.
      if (!wideHeaderQuery.matches) {
        setIsExpanded(false)
        setInlineQuery("")
      }
    }
    wideHeaderQuery.addEventListener("change", updateSearchMode)
    return () => wideHeaderQuery.removeEventListener("change", updateSearchMode)
  }, [])

  useEffect(() => {
    if (isExpanded) inlineInputRef.current?.focus()
  }, [isExpanded])

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
    setIsExpanded(false)
    setInlineQuery("")
    setQuery("")
    navigate(result.route)
    if (result.tab) {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("metalique:quality-tab", { detail: result.tab })), 80)
    }
  }

  return (
    <>
      {/* A largura mora aqui, no item flex, e não na pílula: é ele que pode
          encolher quando a coluna do cabeçalho aperta. O `min-w` é o piso —
          chegando nele o campo para de encolher, e nunca some. Sem isso o
          aperto sobraria para o menu, que tem mínimo zero e colapsaria. */}
      <div
        className={`relative z-30 h-8 min-w-8 transition-[width] duration-300 ease-out lg:h-[38px] lg:min-w-[38px] ${isExpanded ? "w-72" : "w-8 lg:w-[38px]"}`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsExpanded(false)
            setInlineQuery("")
          }
        }}
      >
        <div className="relative size-full overflow-hidden rounded-full bg-white text-black shadow-sm transition-shadow duration-300 ease-out focus-within:shadow-md">
          <Search className="pointer-events-none absolute left-2 top-1/2 z-10 size-4 -translate-y-1/2 lg:left-[9px] lg:size-5" aria-hidden="true" />
          {isExpanded ? (
            <>
              <input
                ref={inlineInputRef}
                className="size-full bg-transparent pl-8 pr-9 text-sm outline-none placeholder:text-black/50 lg:pl-10"
                type="text"
                role="combobox"
                aria-label="Pesquisar abas"
                aria-autocomplete="list"
                aria-controls="header-search-suggestions"
                aria-expanded={Boolean(normalizedInlineQuery)}
                autoComplete="off"
                value={inlineQuery}
                placeholder="Pesquisar..."
                onChange={(event) => setInlineQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") event.currentTarget.blur()
                  if (event.key === "Enter" && inlineSuggestions[0]) {
                    event.preventDefault()
                    openResult(inlineSuggestions[0])
                  }
                }}
              />
              {inlineQuery && (
                <button
                  className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center text-black"
                  type="button"
                  aria-label="Limpar pesquisa"
                  title="Limpar"
                  onClick={() => {
                    setInlineQuery("")
                    inlineInputRef.current?.focus()
                  }}
                >
                  <X className="size-4" strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </>
          ) : (
            <button
              className="absolute inset-0 size-full rounded-full transition-colors hover:bg-black/5"
              type="button"
              aria-label="Pesquisar"
              title="Pesquisar"
              onClick={() => (canExpandInline ? setIsExpanded(true) : setOpen(true))}
            />
          )}
        </div>

        {isExpanded && normalizedInlineQuery && (
          <div
            id="header-search-suggestions"
            className="absolute right-0 top-[calc(100%+0.5rem)] w-72 overflow-hidden rounded-xl border border-black/10 bg-white p-1.5 text-black shadow-xl"
          >
            {inlineSuggestions.length > 0 ? inlineSuggestions.map((item) => (
              <button
                key={item.id}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none"
                type="button"
                onClick={() => openResult(item)}
              >
                {item.route === "/sistema" ? <LayoutDashboard className="size-4 shrink-0 text-[#db0f0f]" /> : item.route === "/usuarios" ? <Users className="size-4 shrink-0 text-[#db0f0f]" /> : item.route === "/piperun" || item.route === "/sige" ? <AppWindow className="size-4 shrink-0 text-[#db0f0f]" /> : <ShieldCheck className="size-4 shrink-0 text-[#db0f0f]" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-[#6e6c67]">{item.type}</span>
                </span>
              </button>
            )) : (
              <p className="px-3 py-3 text-sm text-[#6e6c67]">Nenhuma aba encontrada.</p>
            )}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}>
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
              {item.route === "/sistema" ? <LayoutDashboard className="size-5 text-[#db0f0f]" /> : item.route === "/usuarios" ? <Users className="size-5 text-[#db0f0f]" /> : item.route === "/piperun" || item.route === "/sige" ? <AppWindow className="size-5 text-[#db0f0f]" /> : <ShieldCheck className="size-5 text-[#db0f0f]" />}
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
    </>
  )
}
