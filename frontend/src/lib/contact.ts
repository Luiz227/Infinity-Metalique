import { getJson } from "@/lib/api"

export type ContactInfo = {
  phone: string | null
  email: string | null
  address: string | null
  hours: string | null
}

export type PhoneExtension = {
  id: number
  sector: string
  people: string | null
  number: string
}

export type ContactArea = {
  area: string
  extensions: PhoneExtension[]
}

export type ContactDirectory = {
  contacts: ContactInfo
  areas: ContactArea[]
}

/**
 * A lista é a mesma na aba Contato da Home e no modal do menu do perfil, e não
 * muda de minuto a minuto: a promessa fica guardada no módulo, como o resumo da
 * equipe faz em App.tsx. Assim abrir o modal depois de já ter visto a aba não
 * refaz a requisição. O erro limpa o cache para a próxima tentativa valer.
 */
let request: Promise<ContactDirectory> | null = null

export function loadContactDirectory(): Promise<ContactDirectory> {
  if (!request) {
    request = getJson<ContactDirectory>("/backend/api/contact.php", { cache: "no-store" })
      .catch((error: unknown) => {
        request = null
        throw error
      })
  }

  return request
}

/** Chamada pelo painel de administração: o que foi salvo passa a valer nas duas telas. */
export function invalidateContactDirectory(): void {
  request = null
  window.dispatchEvent(new Event("metalique:contact-updated"))
}

/** Sem acento e em caixa baixa: é o que a busca compara dos dois lados. */
export function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR")
}

export function hasAnyContact(contacts: ContactInfo): boolean {
  return Boolean(contacts.phone || contacts.email || contacts.address || contacts.hours)
}
