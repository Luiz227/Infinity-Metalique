import { type ChangeEvent, type FormEvent, useEffect, useState } from "react"
import { Bell, Camera, ChevronDown, LoaderCircle, Search, UserRound, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { postJson, profilePhotoUrl, readJson } from "@/lib/api"
import { AppLink } from "@/lib/router"
import type { ApiResponse, User } from "@/types"

export function DashboardPage({ user, csrfToken, onUserUpdated, onLogout }: {
  user: User
  csrfToken: string
  onUserUpdated: (user: User) => void
  onLogout: () => void
}) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [profileError, setProfileError] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [displayPhoto, setDisplayPhoto] = useState(() => profilePhotoUrl(user.profile_photo))
  const firstName = user.name.trim().split(/\s+/)[0] || "Usuário"

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const logout = async () => {
    setIsLoggingOut(true)
    try {
      await postJson<ApiResponse>("/backend/api/logout.php", { csrfToken })
      onLogout()
    } finally {
      setIsLoggingOut(false)
    }
  }

  const selectPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    setSelectedPhoto(file)
    setProfileError("")
    setPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  const uploadPhoto = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedPhoto) return
    setIsUploading(true)
    setProfileError("")

    const formData = new FormData()
    formData.append("csrfToken", csrfToken)
    formData.append("profilePhoto", selectedPhoto)

    try {
      const response = await fetch("/backend/api/profile-photo.php", { method: "POST", credentials: "include", body: formData })
      const payload = await readJson<ApiResponse>(response)
      if (payload.user) {
        setDisplayPhoto(profilePhotoUrl(payload.user.profile_photo))
        onUserUpdated(payload.user)
      }
      setIsProfileOpen(false)
      setSelectedPhoto(null)
      setPreviewUrl(null)
    } catch (requestError) {
      setProfileError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#db0f0f] p-3 text-black sm:p-5 lg:h-screen lg:px-[2vw] lg:pb-[1.5vw] lg:pt-[1.5vw]">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1788px] flex-col overflow-hidden rounded-[28px] bg-[#db0f0f] text-white lg:h-full lg:min-h-0 lg:rounded-[50px]">
        <header className="flex min-h-[82px] flex-wrap items-center justify-between gap-4 px-[5%] py-5 lg:min-h-[78px] lg:px-[1%] lg:py-2">
          <AppLink className="flex shrink-0 items-center" to="/" ariaLabel="Metalique Infinity">
            <img className="h-auto w-[94px] lg:w-[150px]" src="/images/logo-b.svg" alt="Metalique Infinity" />
          </AppLink>

          <nav className="order-3 mx-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-[#f2f2f2] p-1 text-[12px] font-light text-black sm:order-none sm:text-sm lg:gap-5 lg:p-[6px] lg:text-[18px]" aria-label="Navegação principal">
            {["Dashboard", "Chamado", "KanBan", "Agenda"].map((item, index) => (
              <a key={item} className={`whitespace-nowrap rounded-full px-3 py-2 leading-none lg:px-[10px] ${index === 0 ? "bg-[#db0f0f] text-white" : "bg-white"}`} href={`#${item.toLowerCase()}`}>{item}</a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-[18px]">
            <Button className="size-8 rounded-full bg-white p-0 text-black hover:bg-white/90 lg:size-[38px]" type="button" aria-label="Buscar" title="Buscar"><Search className="size-4 lg:size-5" /></Button>
            <Button className="size-8 rounded-full bg-white p-0 text-black hover:bg-white/90 lg:size-[38px]" type="button" aria-label="Notificações" title="Notificações"><Bell className="size-4 lg:size-5" /></Button>

            <div className="flex items-center gap-2 text-white lg:gap-[7px]">
              <div className="hidden leading-none sm:block">
                <p className="text-[16px] font-medium leading-none lg:text-[21px]">{firstName}</p>
                <p className="mt-1 text-[10px] font-light leading-none">Cargo</p>
              </div>
              <button className="relative size-11 overflow-hidden rounded-full border border-white bg-black lg:size-[60px]" type="button" onClick={() => setIsProfileOpen(true)} aria-label="Alterar foto de perfil" title="Alterar foto de perfil">
                {displayPhoto ? (
                  <img
                    className="size-full object-cover"
                    src={displayPhoto}
                    alt={`Foto de ${user.name}`}
                    onError={() => setDisplayPhoto(null)}
                  />
                ) : (
                  <span className="grid size-full place-items-center bg-white text-[#db0f0f]">
                    <UserRound className="size-6 lg:size-8" />
                  </span>
                )}
              </button>
              <button className="hidden text-white sm:grid" type="button" onClick={() => void logout()} disabled={isLoggingOut} aria-label="Sair" title="Sair">
                {isLoggingOut ? <LoaderCircle className="size-4 animate-spin" /> : <ChevronDown className="size-4" />}
              </button>
            </div>
          </div>
        </header>

        <section className="flex min-h-0 flex-1 flex-col rounded-[28px] bg-[#f2f2f2] px-[5%] py-8 text-black sm:mx-[2.4%] sm:mb-[2.4%] lg:mx-[0.3%] lg:mb-[0.3%] lg:rounded-[53px] lg:px-[1.7%] lg:py-[2.4%]">
          <div className="flex items-center justify-between gap-4"><h1 className="text-[clamp(30px,2.4vw,43px)] font-medium leading-none">Dashboard</h1></div>
          <div className="mt-8 flex-1 rounded-[18px] border border-black/5 bg-transparent" aria-hidden="true" />
        </section>
      </div>

      {isProfileOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title">
          <section className="w-full max-w-md rounded-lg bg-white p-6 text-neutral-900 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <h2 id="profile-dialog-title" className="text-xl font-semibold">Foto de perfil</h2>
              <Button variant="ghost" size="icon" type="button" onClick={() => setIsProfileOpen(false)} aria-label="Fechar"><X /></Button>
            </div>
            <form className="mt-6 space-y-5" onSubmit={uploadPhoto}>
              <div className="mx-auto size-32 overflow-hidden rounded-full border-2 border-[#db0f0f] bg-neutral-100">
                {(previewUrl || displayPhoto) ? <img className="size-full object-cover" src={previewUrl || displayPhoto || ""} alt="Prévia da foto" /> : <span className="grid size-full place-items-center"><Camera className="size-9 text-neutral-400" /></span>}
              </div>
              {profileError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{profileError}</p>}
              <label className="block cursor-pointer rounded-md border border-[#db0f0f] px-4 py-3 text-center text-sm font-semibold text-[#db0f0f] hover:bg-red-50">
                Escolher imagem
                <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} />
              </label>
              <p className="text-center text-xs text-neutral-500">JPG, PNG ou WebP de até 5 MB.</p>
              <Button className="w-full rounded-full" type="submit" disabled={!selectedPhoto || isUploading}>
                {isUploading && <LoaderCircle className="animate-spin" />}
                {isUploading ? "Atualizando..." : "Atualizar foto"}
              </Button>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
