import { type ChangeEvent, type FormEvent, useEffect, useState } from "react"
import { Camera, Check, Eye, EyeOff, KeyRound, LoaderCircle, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { postJson, profilePhotoUrl, readJson } from "@/lib/api"
import type { ApiResponse, User } from "@/types"

function PasswordInput({ label, value, onChange, autoComplete }: {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="block text-sm font-medium">{label}
      <div className="relative mt-1.5">
        <input className="h-11 w-full rounded-md border border-black/20 px-3 pr-11 outline-none focus:border-[#db0f0f]" type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required minLength={8} maxLength={72} />
        <button className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#6e6c67]" type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} title={visible ? "Ocultar senha" : "Mostrar senha"}>
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </label>
  )
}

export function ProfileDialog({ open, onOpenChange, user, csrfToken, onUserUpdated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User
  csrfToken: string
  onUserUpdated: (user: User) => void
}) {
  const [tab, setTab] = useState<"profile" | "password">("profile")
  const [name, setName] = useState(user.name)
  const [nickname, setNickname] = useState(user.nickname || "")
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const photo = profilePhotoUrl(user.profile_photo)

  useEffect(() => {
    if (!open) return
    setName(user.name)
    setNickname(user.nickname || "")
    setSelectedPhoto(null)
    setPreviewUrl(null)
    setCurrentPassword("")
    setNewPassword("")
    setConfirmation("")
    setError("")
    setNotice("")
    setTab("profile")
  }, [open, user.id])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const selectPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedPhoto(file)
    setPreviewUrl(file ? URL.createObjectURL(file) : null)
    setError("")
  }

  const uploadPhoto = async () => {
    if (!selectedPhoto) return
    setIsUploading(true)
    setError("")
    setNotice("")
    const data = new FormData()
    data.append("csrfToken", csrfToken)
    data.append("profilePhoto", selectedPhoto)

    try {
      const response = await fetch("/backend/api/profile-photo.php", { method: "POST", credentials: "include", body: data })
      const payload = await readJson<ApiResponse>(response)
      if (payload.user) onUserUpdated(payload.user)
      setSelectedPhoto(null)
      setPreviewUrl(null)
      setNotice(payload.message || "Foto atualizada com sucesso.")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsUploading(false)
    }
  }

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setError("")
    setNotice("")
    try {
      const payload = await postJson<ApiResponse>("/backend/api/profile-update.php", { name, nickname, csrfToken })
      if (payload.user) onUserUpdated(payload.user)
      setNotice(payload.message || "Perfil atualizado com sucesso.")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsSaving(false)
    }
  }

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setError("")
    setNotice("")
    try {
      const payload = await postJson<ApiResponse>("/backend/api/password-change.php", { currentPassword, newPassword, confirmation, csrfToken })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmation("")
      setNotice(payload.message || "Senha alterada com sucesso.")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="border-b border-black/10 px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="text-2xl">Meu perfil</DialogTitle>
          <DialogDescription>Atualize seus dados pessoais, foto e senha.</DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-5">
          <div className="inline-flex rounded-md bg-neutral-100 p-1" role="tablist" aria-label="Seções do perfil">
            <button className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-medium ${tab === "profile" ? "bg-white text-black shadow-sm" : "text-[#6e6c67]"}`} type="button" role="tab" aria-selected={tab === "profile"} onClick={() => { setTab("profile"); setError(""); setNotice("") }}><UserRound className="size-4" /> Dados pessoais</button>
            <button className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-medium ${tab === "password" ? "bg-white text-black shadow-sm" : "text-[#6e6c67]"}`} type="button" role="tab" aria-selected={tab === "password"} onClick={() => { setTab("password"); setError(""); setNotice("") }}><KeyRound className="size-4" /> Senha</button>
          </div>
        </div>

        {error && <p className="mx-6 mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        {notice && <p className="mx-6 mt-4 flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800" role="status"><Check className="size-4" />{notice}</p>}

        {tab === "profile" ? (
          <div className="px-6 pb-6">
            <div className="flex flex-col items-center gap-4 border-b border-black/10 py-6 sm:flex-row">
              <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#db0f0f] bg-neutral-100">
                {(previewUrl || photo) ? <img className="size-full object-cover" src={previewUrl || photo || ""} alt="Foto do perfil" /> : <UserRound className="size-9 text-[#898781]" />}
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className="font-semibold">Foto de perfil</p>
                <p className="mt-1 text-xs text-[#6e6c67]">JPG, PNG ou WebP de até 5 MB.</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-black/20 px-3 text-sm font-medium hover:bg-neutral-50"><Camera className="size-4" /> Escolher foto<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} /></label>
                  {selectedPhoto && <Button className="h-9" type="button" onClick={() => void uploadPhoto()} disabled={isUploading}>{isUploading && <LoaderCircle className="animate-spin" />}{isUploading ? "Enviando..." : "Salvar foto"}</Button>}
                </div>
              </div>
            </div>

            <form className="mt-6 space-y-4" onSubmit={saveProfile}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">Nome completo<input className="mt-1.5 h-11 w-full rounded-md border border-black/20 px-3 outline-none focus:border-[#db0f0f]" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></label>
                <label className="text-sm font-medium">Apelido<input className="mt-1.5 h-11 w-full rounded-md border border-black/20 px-3 outline-none focus:border-[#db0f0f]" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={50} placeholder="Como prefere ser chamado" /></label>
                <label className="text-sm font-medium">E-mail<input className="mt-1.5 h-11 w-full cursor-not-allowed rounded-md border border-black/10 bg-neutral-100 px-3 text-[#6e6c67]" value={user.email} disabled /></label>
                <label className="text-sm font-medium">Cargo<input className="mt-1.5 h-11 w-full cursor-not-allowed rounded-md border border-black/10 bg-neutral-100 px-3 text-[#6e6c67]" value={user.job_title} disabled /></label>
              </div>
              <div className="flex justify-end border-t border-black/10 pt-5"><Button type="submit" disabled={isSaving}>{isSaving && <LoaderCircle className="animate-spin" />}{isSaving ? "Salvando..." : "Salvar dados"}</Button></div>
            </form>
          </div>
        ) : (
          <form className="space-y-4 px-6 pb-6 pt-5" onSubmit={changePassword}>
            <p className="rounded-md bg-neutral-50 p-3 text-sm text-[#52514e]">Para sua segurança, confirme a senha atual antes de cadastrar uma nova.</p>
            <PasswordInput label="Senha atual" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
            <div className="grid gap-4 sm:grid-cols-2">
              <PasswordInput label="Nova senha" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
              <PasswordInput label="Confirmar nova senha" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
            </div>
            <div className="flex justify-end border-t border-black/10 pt-5"><Button type="submit" disabled={isSaving}>{isSaving && <LoaderCircle className="animate-spin" />}{isSaving ? "Alterando..." : "Alterar senha"}</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
