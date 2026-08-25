import type { User } from "@/types"

export type RememberedUser = Pick<User, "name" | "nickname" | "email">

const REMEMBERED_USER_STORAGE_KEY = "infinity:remembered-user:v1"

function normalizeRememberedUser(user: RememberedUser): RememberedUser | null {
  const name = user.name.trim()
  const nickname = user.nickname?.trim() || null
  const email = user.email.trim().toLowerCase()
  const separator = email.lastIndexOf("@")

  if (!name || name.length > 255 || email.length > 254 || separator <= 0 || separator === email.length - 1) return null
  return { name, nickname, email }
}

export function readRememberedUser(): RememberedUser | null {
  if (typeof window === "undefined") return null

  try {
    const stored = JSON.parse(window.localStorage.getItem(REMEMBERED_USER_STORAGE_KEY) || "null") as Partial<RememberedUser> | null
    if (typeof stored?.name !== "string" || typeof stored.email !== "string") return null
    const nickname = typeof stored.nickname === "string" ? stored.nickname : null
    return normalizeRememberedUser({ name: stored.name, nickname, email: stored.email })
  } catch {
    return null
  }
}

export function writeRememberedUser(user: RememberedUser): RememberedUser | null {
  const rememberedUser = normalizeRememberedUser(user)
  if (!rememberedUser || typeof window === "undefined") return null

  try {
    window.localStorage.setItem(REMEMBERED_USER_STORAGE_KEY, JSON.stringify(rememberedUser))
  } catch {
    // O fluxo continua funcionando mesmo quando o navegador bloqueia storage.
  }

  return rememberedUser
}

export function clearRememberedUser(): void {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(REMEMBERED_USER_STORAGE_KEY)
  } catch {
    // Sem storage, basta limpar o estado em memória mantido pelo App.
  }
}

export function maskEmail(email: string): string {
  const separator = email.lastIndexOf("@")
  if (separator <= 0) return "••••"

  const localPart = email.slice(0, separator)
  const domain = email.slice(separator + 1)
  const maskedLocalPart = localPart.length <= 2
    ? `${localPart[0]}••••`
    : `${localPart[0]}••••${localPart.at(-1)}`

  return `${maskedLocalPart}@${domain}`
}
