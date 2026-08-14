export async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { message?: string }

  if (!response.ok) {
    throw new Error(payload.message || "Não foi possível concluir a solicitação.")
  }

  return payload
}

export async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include" })
  return readJson<T>(response)
}

type CsrfPayload = { csrfToken?: string }

async function renewCsrfToken(): Promise<string> {
  const response = await fetch("/backend/api/csrf.php", {
    credentials: "include",
    cache: "no-store",
  })
  const payload = await readJson<CsrfPayload>(response)
  const csrfToken = payload.csrfToken || ""

  if (!csrfToken) {
    throw new Error("Não foi possível renovar a sessão.")
  }

  window.dispatchEvent(new CustomEvent<string>("metalique:csrf-token", { detail: csrfToken }))
  return csrfToken
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const send = (requestBody: unknown) => fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    })

  let response = await send(body)

  // Uma sessão recém-aberta pode trocar de token entre requisições concorrentes.
  // Renovamos e repetimos uma única vez; outros erros continuam sendo devolvidos.
  if (response.status === 419 && body !== null && typeof body === "object" && !Array.isArray(body)) {
    const csrfToken = await renewCsrfToken()
    response = await send({ ...body, csrfToken })
  }

  return readJson<T>(response)
}

export function profilePhotoUrl(photo: string | null): string | null {
  if (!photo) return null
  return photo.startsWith("http") || photo.startsWith("/") ? photo : `/${photo}`
}
