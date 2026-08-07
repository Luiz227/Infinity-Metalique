export async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { message?: string }

  if (!response.ok) {
    throw new Error(payload.message || "Não foi possível concluir a solicitação.")
  }

  return payload
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" })
  return readJson<T>(response)
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  return readJson<T>(response)
}

export function profilePhotoUrl(photo: string | null): string | null {
  if (!photo) return null
  return photo.startsWith("http") || photo.startsWith("/") ? photo : `/${photo}`
}
