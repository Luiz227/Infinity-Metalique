import { type FormEvent, useCallback, useEffect, useState } from "react"
import { Eye, EyeOff, LoaderCircle } from "lucide-react"

import { AuthVisual, RedLines } from "@/components/auth/AuthVisual"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { postJson } from "@/lib/api"
import type { ApiResponse, User } from "@/types"

type ResetStatus = "pending" | "approved" | "rejected" | "completed" | "expired" | "invalid" | null
type SavedResetRequest = { email: string; requestToken: string }

const RESET_STORAGE_KEY = "metalique:password-reset-request"

function savedResetRequest(): SavedResetRequest | null {
  try {
    const saved = JSON.parse(localStorage.getItem(RESET_STORAGE_KEY) || "null") as SavedResetRequest | null
    return saved?.email && saved?.requestToken ? saved : null
  } catch {
    return null
  }
}

export function LoginPage({ csrfToken, onAuthenticated }: { csrfToken: string; onAuthenticated: (user: User) => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [resetRequest, setResetRequest] = useState<SavedResetRequest | null>(savedResetRequest)
  const [resetStatus, setResetStatus] = useState<ResetStatus>(resetRequest ? "pending" : null)
  const [newPassword, setNewPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [resetError, setResetError] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResetSubmitting, setIsResetSubmitting] = useState(false)

  const checkResetStatus = useCallback(async () => {
    if (!csrfToken || !resetRequest) return
    try {
      const payload = await postJson<{ status: ResetStatus }>("/backend/api/password-reset-status.php", {
        csrfToken,
        email: resetRequest.email,
        requestToken: resetRequest.requestToken,
      })
      setResetStatus(payload.status)
      if (payload.status === "approved" || payload.status === "rejected" || payload.status === "expired") {
        setForgotPasswordOpen(true)
      }
      if (payload.status === "invalid" || payload.status === "completed") {
        localStorage.removeItem(RESET_STORAGE_KEY)
        setResetRequest(null)
      }
    } catch {
      // A próxima consulta automática tenta novamente sem interromper o login.
    }
  }, [csrfToken, resetRequest])

  useEffect(() => {
    void checkResetStatus()
    const timer = window.setInterval(() => void checkResetStatus(), 10000)
    return () => window.clearInterval(timer)
  }, [checkResetStatus])

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setNotice("")
    setIsSubmitting(true)

    try {
      const payload = await postJson<ApiResponse>("/backend/api/login.php", {
        csrfToken,
        email: email.trim(),
        password,
      })
      if (payload.user) onAuthenticated(payload.user)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const requestPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setResetError("")
    setIsResetSubmitting(true)
    try {
      const payload = await postJson<{ message: string; requestToken?: string; alreadyPending?: boolean }>(
        "/backend/api/password-reset-request.php",
        { csrfToken, email: forgotEmail.trim() },
      )
      if (payload.requestToken) {
        const request = { email: forgotEmail.trim().toLowerCase(), requestToken: payload.requestToken }
        localStorage.setItem(RESET_STORAGE_KEY, JSON.stringify(request))
        setResetRequest(request)
        setResetStatus("pending")
        setEmail(request.email)
      }
      setNotice(payload.message)
      if (payload.requestToken) setForgotPasswordOpen(false)
      if (payload.alreadyPending) setResetError("A solicitação existente deve ser analisada pelo administrador.")
    } catch (requestError) {
      setResetError(requestError instanceof Error ? requestError.message : "Não foi possível enviar a solicitação.")
    } finally {
      setIsResetSubmitting(false)
    }
  }

  const completePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!resetRequest) return
    setResetError("")
    setIsResetSubmitting(true)
    try {
      const payload = await postJson<{ message: string }>("/backend/api/password-reset-complete.php", {
        csrfToken,
        email: resetRequest.email,
        requestToken: resetRequest.requestToken,
        newPassword,
        confirmation,
      })
      localStorage.removeItem(RESET_STORAGE_KEY)
      setEmail(resetRequest.email)
      setResetRequest(null)
      setResetStatus(null)
      setNewPassword("")
      setConfirmation("")
      setForgotPasswordOpen(false)
      setNotice(payload.message)
    } catch (requestError) {
      setResetError(requestError instanceof Error ? requestError.message : "Não foi possível alterar a senha.")
    } finally {
      setIsResetSubmitting(false)
    }
  }

  const startAnotherRequest = () => {
    localStorage.removeItem(RESET_STORAGE_KEY)
    setResetRequest(null)
    setResetStatus(null)
    setResetError("")
    setForgotEmail(email)
  }

  return (
    <main className="page-frame login-frame">
      <AuthVisual />
      <section className="login-content">
        <img className="login-logo" src="/images/logo.svg" alt="Metalique Infinity" />
        <form className="login-form" id="login-form" onSubmit={submitLogin}>
          {notice && <p className="rounded-md bg-green-50 p-3 text-sm text-green-800" role="status">{notice}</p>}
          {resetStatus === "pending" && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="status">Sua recuperação de senha está aguardando a decisão do administrador.</p>}
          {resetStatus === "approved" && <button className="w-full rounded-md bg-green-50 p-3 text-left text-sm font-medium text-green-800 underline" type="button" onClick={() => setForgotPasswordOpen(true)}>Recuperação aprovada. Clique aqui para criar uma nova senha.</button>}
          {error && <p className="form-feedback" role="alert">{error}</p>}
          <div className="form-field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="senha">Senha</label>
            <div className="password-control">
              <input id="senha" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button className="password-toggle" type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} title={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword((visible) => !visible)}>
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>
          <button className="forgot-password" type="button" onClick={() => { setForgotEmail(email); setResetError(""); setForgotPasswordOpen(true) }}>Esqueceu sua senha?</button>
        </form>
        <button className="login-button" type="submit" form="login-form" disabled={isSubmitting || !csrfToken}>
          {isSubmitting ? <LoaderCircle className="mx-auto size-6 animate-spin" aria-label="Entrando" /> : "Entrar"}
        </button>
        <RedLines />
      </section>

      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="max-w-md">
          {resetStatus === "approved" && resetRequest ? (
            <form onSubmit={completePasswordReset}>
              <DialogHeader>
                <DialogTitle>Cadastre sua nova senha</DialogTitle>
                <DialogDescription>O administrador aprovou sua solicitação. A autorização é válida por 24 horas.</DialogDescription>
              </DialogHeader>
              {resetError && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{resetError}</p>}
              <div className="mt-5 space-y-4">
                <label className="block text-sm font-medium">Nova senha
                  <div className="relative mt-1.5">
                    <input className="h-11 w-full rounded-md border border-black/20 px-3 pr-11 outline-none focus:border-[#db0f0f]" type={showNewPassword ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
                    <button className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#6e6c67]" type="button" onClick={() => setShowNewPassword((current) => !current)} aria-label={showNewPassword ? "Ocultar senha" : "Mostrar senha"}>{showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                  </div>
                </label>
                <label className="block text-sm font-medium">Confirmar nova senha
                  <input className="mt-1.5 h-11 w-full rounded-md border border-black/20 px-3 outline-none focus:border-[#db0f0f]" type={showNewPassword ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
                </label>
                <p className="text-xs text-[#6e6c67]">Use no mínimo 8 caracteres, com número e caractere especial.</p>
              </div>
              <DialogFooter className="mt-6">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={isResetSubmitting}>{isResetSubmitting && <LoaderCircle className="animate-spin" />}{isResetSubmitting ? "Alterando..." : "Alterar senha"}</Button>
              </DialogFooter>
            </form>
          ) : resetStatus === "pending" && resetRequest ? (
            <>
              <DialogHeader>
                <DialogTitle>Solicitação em análise</DialogTitle>
                <DialogDescription>O administrador recebeu seu pedido. Esta tela será atualizada automaticamente após a decisão.</DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex items-center gap-3 rounded-md bg-amber-50 p-4 text-sm text-amber-800"><LoaderCircle className="size-5 animate-spin" /> Aguardando aprovação</div>
              <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Voltar ao login</Button></DialogClose></DialogFooter>
            </>
          ) : resetStatus === "rejected" || resetStatus === "expired" ? (
            <>
              <DialogHeader>
                <DialogTitle>{resetStatus === "rejected" ? "Solicitação recusada" : "Aprovação expirada"}</DialogTitle>
                <DialogDescription>{resetStatus === "rejected" ? "O administrador recusou a recuperação desta senha." : "A autorização de 24 horas terminou."}</DialogDescription>
              </DialogHeader>
              <DialogFooter><Button type="button" onClick={startAnotherRequest}>Fazer nova solicitação</Button></DialogFooter>
            </>
          ) : (
            <form onSubmit={requestPasswordReset}>
              <DialogHeader>
                <DialogTitle>Recuperação de senha</DialogTitle>
                <DialogDescription>Informe seu e-mail. O administrador receberá uma solicitação para autorizar a troca.</DialogDescription>
              </DialogHeader>
              {resetError && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{resetError}</p>}
              <label className="mt-5 block text-sm font-medium">E-mail
                <input className="mt-1.5 h-11 w-full rounded-md border border-black/20 px-3 outline-none focus:border-[#db0f0f]" type="email" autoComplete="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} required />
              </label>
              <DialogFooter className="mt-6">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={isResetSubmitting || !csrfToken}>{isResetSubmitting && <LoaderCircle className="animate-spin" />}{isResetSubmitting ? "Enviando..." : "Solicitar recuperação"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
