import { type FormEvent, useState } from "react"
import { Eye, EyeOff, KeyRound, LoaderCircle, LogOut, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { postJson } from "@/lib/api"
import type { ApiResponse, User } from "@/types"

function PasswordField({ id, label, value, onChange, autoComplete }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="block text-sm font-medium" htmlFor={id}>
      {label}
      <span className="relative mt-1.5 block">
        <input
          id={id}
          className="h-11 w-full rounded-md border border-black/20 px-3 pr-11 outline-none focus:border-[#db0f0f] focus:ring-2 focus:ring-[#db0f0f]/15"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <button
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#6e6c67]"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          title={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
    </label>
  )
}

export function RequiredPasswordChangePage({ user, csrfToken, onChanged, onLogout }: {
  user: User
  csrfToken: string
  onChanged: (user: User) => void
  onLogout: (csrfToken: string) => void
}) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")

    if (newPassword.length < 8 || !/\d/u.test(newPassword) || !/[^\p{L}\p{N}]/u.test(newPassword)) {
      setError("Use pelo menos 8 caracteres, incluindo um número e um caractere especial.")
      return
    }

    if (newPassword !== confirmation) {
      setError("A confirmação da nova senha não confere.")
      return
    }

    setIsSaving(true)
    try {
      const payload = await postJson<ApiResponse>("/backend/api/password-change.php", {
        csrfToken,
        currentPassword,
        newPassword,
        confirmation,
      })
      if (payload.user) onChanged(payload.user)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível alterar a senha.")
    } finally {
      setIsSaving(false)
    }
  }

  const logout = async () => {
    setIsLoggingOut(true)
    try {
      const payload = await postJson<ApiResponse>("/backend/api/logout.php", { csrfToken })
      if (payload.csrfToken) onLogout(payload.csrfToken)
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#db0f0f] p-4 sm:p-8">
      <section className="w-full max-w-md rounded-lg bg-white p-6 text-black shadow-2xl sm:p-8" aria-labelledby="required-password-title">
        <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-5">
          <img className="h-auto w-28" src="/images/logo.svg" alt="Metalique Infinity" />
          <span className="grid size-11 place-items-center rounded-full bg-red-50 text-[#db0f0f]" aria-hidden="true">
            <ShieldCheck className="size-6" />
          </span>
        </div>

        <div className="mt-6">
          <p className="text-sm text-[#6e6c67]">Primeiro acesso de {user.name}</p>
          <h1 id="required-password-title" className="mt-1 text-2xl font-semibold">Crie uma nova senha</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#52514e]">A senha temporária precisa ser substituída antes de acessar o sistema.</p>
        </div>

        {error && <p className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <PasswordField id="senha-atual" label="Senha temporária" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
          <PasswordField id="nova-senha" label="Nova senha" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
          <PasswordField id="confirmar-senha" label="Confirmar nova senha" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
          <p className="text-xs leading-relaxed text-[#6e6c67]">Mínimo de 8 caracteres, com pelo menos um número e um caractere especial.</p>

          <Button className="mt-2 w-full" type="submit" disabled={isSaving || !csrfToken}>
            {isSaving ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
            {isSaving ? "Alterando..." : "Alterar senha e continuar"}
          </Button>
        </form>

        <Button className="mt-3 w-full" type="button" variant="ghost" onClick={() => void logout()} disabled={isLoggingOut}>
          {isLoggingOut ? <LoaderCircle className="animate-spin" /> : <LogOut />}
          Sair
        </Button>
      </section>
    </main>
  )
}
