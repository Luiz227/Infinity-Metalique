import { useCallback, useEffect, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"

import { CatalogRow, CatalogSection, move, nextDraftKey, patch } from "@/components/settings/CatalogEditor"
import { useDraftSection } from "@/components/settings/SettingsDraft"
import { SettingsFeedback } from "@/components/settings/SettingsRow"
import { Input } from "@/components/ui/input"
import { getJson, postJson } from "@/lib/api"
import { type ContactInfo, invalidateContactDirectory } from "@/lib/contact"

type AdminExtension = {
  id: number
  area: string
  sector: string
  people: string
  number: string
  position: number
  active: boolean
}

type AdminPayload = { contacts: ContactInfo; extensions: AdminExtension[] }

/** `key` existe só para o React: linhas novas ainda não têm id do banco. */
type DraftExtension = {
  key: string
  id: number | null
  area: string
  sector: string
  people: string
  number: string
  active: boolean
}

type DraftContacts = { phone: string; email: string; address: string; hours: string }

const EMPTY_CONTACTS: DraftContacts = { phone: "", email: "", address: "", hours: "" }

const CONTACT_FIELDS: { key: keyof DraftContacts; label: string; placeholder: string; type?: string }[] = [
  { key: "phone", label: "Telefone", placeholder: "(41) 0000-0000" },
  { key: "email", label: "E-mail", placeholder: "contato@metalique.com.br", type: "email" },
  { key: "address", label: "Endereço", placeholder: "Rua, número - cidade/UF" },
  { key: "hours", label: "Atendimento", placeholder: "Seg. a sex., 8h às 18h" },
]

/** O que sobe ao servidor - e, por isso mesmo, o que define "mexeram nisto". */
const shape = (extensions: DraftExtension[], contacts: DraftContacts) => JSON.stringify({
  contacts,
  extensions: extensions.map((item) => [item.id, item.area, item.sector, item.people, item.number, item.active]),
})

/**
 * A lista de ramais e os canais gerais que a aba Contato da Home mostra.
 *
 * Mesmo contrato do painel da Qualidade: rascunho local, e o Salvar da barra da
 * central manda tudo de uma vez. A área de cada linha é texto livre porque é ela
 * que forma os grupos da tela pública - a primeira linha de uma área é quem põe
 * o grupo no lugar dele, então mover uma linha move o grupo junto.
 */
export function ContactSection({ csrfToken }: { csrfToken: string }) {
  const [extensions, setExtensions] = useState<DraftExtension[]>([])
  const [contacts, setContacts] = useState<DraftContacts>(EMPTY_CONTACTS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  // O retrato do último estado gravado, para saber o que é mudança e para o
  // Descartar ter a que voltar sem pedir tudo ao servidor de novo.
  const baseline = useRef("")
  const [baselineVersion, setBaselineVersion] = useState(0)
  const lastPayload = useRef<AdminPayload | null>(null)

  const adopt = useCallback((payload: AdminPayload) => {
    const nextExtensions = payload.extensions.map((item) => ({
      key: `ramal-${item.id}`,
      id: item.id,
      area: item.area,
      sector: item.sector,
      people: item.people,
      number: item.number,
      active: item.active,
    }))
    const nextContacts: DraftContacts = {
      phone: payload.contacts.phone || "",
      email: payload.contacts.email || "",
      address: payload.contacts.address || "",
      hours: payload.contacts.hours || "",
    }

    setExtensions(nextExtensions)
    setContacts(nextContacts)
    lastPayload.current = payload
    baseline.current = shape(nextExtensions, nextContacts)
    setBaselineVersion((current) => current + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError("")

    getJson<AdminPayload>("/backend/api/admin/contact.php", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((payload) => {
        if (controller.signal.aborted) return
        adopt(payload)
        setIsLoading(false)
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return
        setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar os ramais.")
        setIsLoading(false)
      })

    return () => controller.abort()
  }, [adopt])

  const save = useCallback(async () => {
    setError("")
    setNotice("")
    setIsSaving(true)

    try {
      const payload = await postJson<AdminPayload & { message: string }>("/backend/api/admin/contact-save.php", {
        csrfToken,
        contacts,
        extensions: extensions.map((item) => ({
          id: item.id,
          area: item.area,
          sector: item.sector,
          people: item.people,
          number: item.number,
          active: item.active,
        })),
      })
      adopt(payload)
      setNotice(payload.message)
      // A Home e o modal do menu guardam a lista em cache: sem este aviso, quem
      // já está com a tela aberta continuaria vendo a versão antiga.
      invalidateContactDirectory()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível salvar os ramais.")
      throw requestError
    } finally {
      setIsSaving(false)
    }
  }, [adopt, contacts, csrfToken, extensions])

  const discard = useCallback(() => {
    if (lastPayload.current) adopt(lastPayload.current)
    setError("")
    setNotice("")
  }, [adopt])

  useDraftSection({
    id: "ramais",
    // `baselineVersion` entra na conta só para a comparação ser refeita quando
    // o retrato muda: `baseline` é uma referência, e sozinha não dispara render.
    isDirty: !isLoading && Boolean(baselineVersion) && shape(extensions, contacts) !== baseline.current,
    save,
    discard,
  })

  const busy = isLoading || isSaving

  if (isLoading) {
    return (
      <div className="grid h-40 place-items-center text-ink-muted">
        <LoaderCircle className="size-6 animate-spin" aria-label="Carregando ramais" />
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <SettingsFeedback error={error} notice={notice} />

      <section className="rounded-md border border-hairline p-4">
        <h3 className="text-sm font-semibold">Contatos gerais</h3>
        <p className="mt-1 text-xs text-ink-muted">
          Aparecem acima da lista de ramais na aba Contato. Campo vazio some da tela.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {CONTACT_FIELDS.map((field) => (
            <label key={field.key} className="block text-sm font-medium">
              {field.label}
              <Input
                className="mt-2 h-10"
                type={field.type || "text"}
                placeholder={field.placeholder}
                value={contacts[field.key]}
                disabled={busy}
                onChange={(event) => setContacts((current) => ({ ...current, [field.key]: event.target.value }))}
              />
            </label>
          ))}
        </div>
      </section>

      <CatalogSection
        title="Ramais"
        description="A ordem daqui é a ordem da tela pública, e a área agrupa as linhas."
        addLabel="Adicionar ramal"
        onAdd={() => setExtensions((current) => [
          ...current,
          {
            key: nextDraftKey(),
            id: null,
            // A área da última linha já vem preenchida: quase todo ramal novo
            // entra no mesmo andar do anterior.
            area: current.at(-1)?.area || "",
            sector: "",
            people: "",
            number: "",
            active: true,
          },
        ])}
        disabled={busy}
      >
        {extensions.map((extension, index) => (
          <CatalogRow
            key={extension.key}
            index={index}
            total={extensions.length}
            active={extension.active}
            disabled={busy}
            onMove={(to) => setExtensions((current) => move(current, index, to))}
            onToggle={() => setExtensions((current) => patch(current, index, { active: !extension.active }))}
            onRemove={() => setExtensions((current) => current.filter((_, item) => item !== index))}
          >
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,6rem)]">
              <Input
                aria-label={`Área do ramal ${index + 1}`}
                className="h-10"
                placeholder="2º Andar Fábrica 1"
                value={extension.area}
                disabled={busy}
                onChange={(event) => setExtensions((current) => patch(current, index, { area: event.target.value }))}
              />
              <Input
                aria-label={`Setor do ramal ${index + 1}`}
                className="h-10"
                placeholder="VENDAS 1"
                value={extension.sector}
                disabled={busy}
                onChange={(event) => setExtensions((current) => patch(current, index, { sector: event.target.value }))}
              />
              <Input
                aria-label={`Quem atende o ramal ${index + 1}`}
                className="h-10"
                placeholder="quem atende (opcional)"
                value={extension.people}
                disabled={busy}
                onChange={(event) => setExtensions((current) => patch(current, index, { people: event.target.value }))}
              />
              <Input
                aria-label={`Número do ramal ${index + 1}`}
                className="h-10"
                inputMode="numeric"
                placeholder="2006"
                value={extension.number}
                disabled={busy}
                onChange={(event) => setExtensions((current) => patch(current, index, { number: event.target.value }))}
              />
            </div>
          </CatalogRow>
        ))}
      </CatalogSection>
    </div>
  )
}
