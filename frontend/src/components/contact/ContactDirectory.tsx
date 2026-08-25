import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { Check, Clock, Copy, LoaderCircle, Mail, MapPin, Phone, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Scroller } from "@/components/ui/scroller"
import {
  type ContactArea,
  type ContactDirectory as Directory,
  hasAnyContact,
  loadContactDirectory,
  normalizeForSearch,
} from "@/lib/contact"
import { cn } from "@/lib/utils"

/**
 * A lista de ramais da fábrica, agrupada por prédio e andar.
 *
 * Um conteúdo, dois enquadramentos: a aba Contato da Home o abre como página e o
 * menu do perfil o abre em modal. A moldura é de quem chama - aqui fica só a
 * busca, os canais gerais e a lista, e `variant` escolhe a densidade.
 *
 * O componente cuida da própria rolagem: a busca fica parada no topo e só a
 * lista corre por baixo dela, senão o campo sumiria justo quando é mais usado.
 */
export function ContactDirectory({ variant = "page" }: { variant?: "page" | "dialog" }) {
  const [directory, setDirectory] = useState<Directory | null>(null)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const isPage = variant === "page"

  useEffect(() => {
    let active = true

    const load = () => {
      setError("")
      loadContactDirectory()
        .then((payload) => {
          if (active) setDirectory(payload)
        })
        .catch((requestError: unknown) => {
          if (!active) return
          setDirectory(null)
          setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar os ramais.")
        })
    }

    load()
    // Salvar no painel de administração invalida o cache e avisa quem está aberto.
    window.addEventListener("metalique:contact-updated", load)

    return () => {
      active = false
      window.removeEventListener("metalique:contact-updated", load)
    }
  }, [])

  const areas = useMemo(() => filterAreas(directory?.areas || [], query), [directory, query])
  const contacts = directory?.contacts

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <label className="relative block shrink-0">
        <span className="sr-only">Buscar ramal</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <Input
          className={cn("pl-11", isPage && "lg:h-12")}
          type="search"
          placeholder="Buscar por setor, pessoa ou número"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <Scroller
        className="scroll-fade [--scroll-fade-size:1.5rem] min-h-0 flex-1 overflow-y-auto"
        contentClassName="flex flex-col gap-5 pb-2"
      >
        {error && (
          <p className="rounded-md border border-hairline bg-neutral-50 px-4 py-3 text-sm text-ink-soft">{error}</p>
        )}

        {!directory && !error && (
          <div className="grid h-40 place-items-center text-ink-muted">
            <LoaderCircle className="size-6 animate-spin" aria-label="Carregando ramais" />
          </div>
        )}

        {contacts && hasAnyContact(contacts) && (
          <section className="grid gap-2 rounded-card border border-hairline bg-surface p-4">
            <h2 className="text-sm font-semibold text-ink">Contatos gerais</h2>
            <dl className={cn("grid gap-2", isPage && "sm:grid-cols-2")}>
              <ContactLine icon={<Phone className="size-4" />} label="Telefone" value={contacts.phone} />
              <ContactLine icon={<Mail className="size-4" />} label="E-mail" value={contacts.email} />
              <ContactLine icon={<MapPin className="size-4" />} label="Endereço" value={contacts.address} />
              <ContactLine icon={<Clock className="size-4" />} label="Atendimento" value={contacts.hours} />
            </dl>
          </section>
        )}

        {directory && areas.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-muted">
            Nenhum ramal encontrado para “{query.trim()}”.
          </p>
        )}

        {/* Duas colunas na página a partir de lg: a lista tem quase quarenta
            linhas, e numa coluna só ela vira uma fita comprida. Colunas de
            texto, e não uma grade: com grade, o grupo de uma linha só ficaria
            lado a lado com o de quinze e deixaria meio painel vazio. O modal é
            estreito demais para isso e fica sempre em coluna única. */}
        <div className={cn("flex flex-col gap-5", isPage && "lg:block lg:columns-2")}>
          {areas.map((area) => (
            <section key={area.area} className={cn("grid gap-1.5", isPage && "lg:mb-5 lg:break-inside-avoid")}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{area.area}</h2>
              <ul className="grid overflow-hidden rounded-card border border-hairline bg-surface">
                {area.extensions.map((extension) => (
                  <li
                    key={extension.id}
                    className="flex items-center gap-3 border-b border-hairline px-3 py-2.5 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate font-medium text-ink", isPage ? "text-sm" : "text-[13px]")}>
                        {extension.sector}
                      </span>
                      {extension.people && (
                        <span className="mt-0.5 block truncate text-[12px] text-ink-muted">{extension.people}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-metalique">
                      {extension.number}
                    </span>
                    <CopyButton number={extension.number} sector={extension.sector} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Scroller>
    </div>
  )
}

function ContactLine({ icon, label, value }: { icon: ReactNode; label: string; value: string | null }) {
  if (!value) return null

  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true">{icon}</span>
      <span className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</dt>
        <dd className="text-sm text-ink">{value}</dd>
      </span>
    </div>
  )
}

/**
 * Copiar, e não `tel:`: dentro do Electron um link de telefone cairia num
 * handler externo do Windows, e o que a pessoa quer é o número no teclado do
 * aparelho que está na mesa dela.
 */
function CopyButton({ number, sector }: { number: string; sector: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return

    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = useCallback(() => {
    // Sem clipboard (contexto inseguro, permissão negada) o botão simplesmente
    // não confirma: o número continua à vista, que é o essencial.
    navigator.clipboard?.writeText(number).then(() => setCopied(true)).catch(() => setCopied(false))
  }, [number])

  return (
    <button
      type="button"
      className="grid size-8 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/25"
      aria-label={copied ? `Ramal ${number} copiado` : `Copiar o ramal ${number} de ${sector}`}
      title={copied ? "Copiado" : "Copiar ramal"}
      onClick={copy}
    >
      {copied ? <Check className="size-4 text-metalique" /> : <Copy className="size-4" />}
    </button>
  )
}

/** A busca casa setor, pessoas, área e número; a área some quando esvazia. */
function filterAreas(areas: ContactArea[], query: string): ContactArea[] {
  const term = normalizeForSearch(query.trim())
  if (!term) return areas

  return areas
    .map((area) => ({
      area: area.area,
      extensions: area.extensions.filter((extension) => (
        normalizeForSearch(`${extension.sector} ${extension.people || ""} ${area.area} ${extension.number}`)
          .includes(term)
      )),
    }))
    .filter((area) => area.extensions.length > 0)
}
