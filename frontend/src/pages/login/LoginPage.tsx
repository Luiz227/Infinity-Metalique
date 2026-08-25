import { type FormEvent, useCallback, useEffect, useRef, useState } from "react"
import { Eye, EyeOff, LoaderCircle } from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { Scroller } from "@/components/ui/scroller"
import { postJson } from "@/lib/api"
import { maskEmail, type RememberedUser } from "@/lib/rememberedUser"
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

export function LoginPage({ csrfToken, rememberedUser, onAuthenticated, onClose, onRequestAccess, onForgetRememberedUser }: {
  csrfToken: string
  rememberedUser: RememberedUser | null
  onAuthenticated: (user: User, csrfToken: string) => void
  onClose: () => void
  onRequestAccess: () => void
  onForgetRememberedUser: () => void
}) {
  const [email, setEmail] = useState(() => rememberedUser?.email || "")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [resetRequest, setResetRequest] = useState<SavedResetRequest | null>(savedResetRequest)
  const [resetStatus, setResetStatus] = useState<ResetStatus>(resetRequest ? "pending" : null)
  const [newPassword, setNewPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [resetError, setResetError] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResetSubmitting, setIsResetSubmitting] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const isRememberedAccount = Boolean(rememberedUser && email === rememberedUser.email)

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
      if (payload.user && payload.csrfToken) onAuthenticated(payload.user, payload.csrfToken)
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

  const useAnotherAccount = () => {
    onForgetRememberedUser()
    setEmail("")
    setPassword("")
    setError("")
    setNotice("")
    window.requestAnimationFrame(() => emailInputRef.current?.focus())
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !isSubmitting) onClose()
        }}
      >
        <DialogContent
          className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-[27rem] flex-col gap-0 overflow-hidden rounded-[20px] border-hairline bg-surface p-0 shadow-[0_24px_80px_rgb(11_11_11/0.18)] sm:max-h-[calc(100dvh-3rem)]"
          showCloseButton={!isSubmitting}
          onEscapeKeyDown={(event) => {
            if (isSubmitting) event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (isSubmitting) event.preventDefault()
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            const target = isRememberedAccount ? passwordInputRef : emailInputRef
            target.current?.focus()
          }}
        >
          <form className="flex min-h-0 flex-1 flex-col overflow-hidden" id="login-form" onSubmit={submitLogin}>
            <DialogHeader className="shrink-0 border-b border-hairline px-6 pb-5 pr-14 pt-6 sm:px-8 sm:pb-6 sm:pr-16 sm:pt-8">
              <DialogTitle className="text-2xl tracking-[-0.02em] text-ink sm:text-3xl">Bem-vindo de volta!</DialogTitle>
              <DialogDescription>Seu trabalho é importante para nós.</DialogDescription>
            </DialogHeader>

            <Scroller
              className="scroll-fade [--scroll-fade-size:1.5rem] min-h-0 flex-1 overflow-y-auto overscroll-contain"
              contentClassName="px-6 py-6 sm:px-8"
            >
              {notice && <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-800" role="status">{notice}</p>}
              {resetStatus === "pending" && <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="status">Sua recuperação de senha está aguardando a decisão do administrador.</p>}
              {resetStatus === "approved" && <button className="mb-4 w-full rounded-md bg-green-50 p-3 text-left text-sm font-medium text-green-800 underline" type="button" onClick={() => setForgotPasswordOpen(true)}>Recuperação aprovada. Clique aqui para criar uma nova senha.</button>}
              {error && <p className="mb-4 rounded-md border border-metalique/25 bg-red-50 p-3 text-sm font-medium text-[#a50b0b]" role="alert">{error}</p>}

              <label className="block text-sm font-medium text-ink-soft" htmlFor="email">
                {isRememberedAccount ? "E-mail lembrado" : "E-mail"}
                {isRememberedAccount ? (
                  <Input
                    ref={emailInputRef}
                    className="mt-1.5 cursor-default bg-ink/[0.025] text-sm text-ink-soft"
                    id="email"
                    type="text"
                    autoComplete="username"
                    value={maskEmail(email)}
                    readOnly
                    aria-readonly="true"
                    aria-describedby="remembered-email-description"
                  />
                ) : (
                  <Input
                    ref={emailInputRef}
                    className="mt-1.5 text-sm"
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                )}
              </label>

              {isRememberedAccount && (
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-ink-muted">
                  <span id="remembered-email-description">Conta lembrada neste dispositivo</span>
                  <button
                    className="shrink-0 font-medium transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/15"
                    type="button"
                    onClick={useAnotherAccount}
                  >
                    Usar outro e-mail
                  </button>
                </div>
              )}

              <label className="mt-4 block text-sm font-medium text-ink-soft" htmlFor="senha">
                Senha
                <span className="relative mt-1.5 block">
                  <Input ref={passwordInputRef} className="pr-12 text-sm" id="senha" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                  <button
                    className="absolute inset-y-0 right-1 grid w-10 place-items-center rounded-full text-ink-muted transition-colors hover:text-ink"
                    type="button"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </span>
              </label>

              <button
                className="mt-4 block w-full text-center text-sm text-ink-soft transition-colors hover:text-ink"
                type="button"
                onClick={() => { setForgotEmail(email); setResetError(""); setForgotPasswordOpen(true) }}
              >
                Esqueceu sua senha?
              </button>
            </Scroller>

            <DialogFooter className="shrink-0 flex-col gap-3 border-t border-hairline px-6 py-5 sm:flex-col sm:justify-start sm:px-8 sm:py-6">
              <Button className="w-full" size="lg" type="submit" disabled={isSubmitting || !csrfToken}>
                {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {isSubmitting ? "Entrando..." : "Entrar"}
              </Button>

              <p className="text-center text-sm text-ink-soft">
                Ainda não tem acesso?{" "}
                <button
                  className="font-medium text-metalique transition-colors hover:text-metalique-strong disabled:pointer-events-none disabled:opacity-50"
                  type="button"
                  disabled={isSubmitting}
                  onClick={onRequestAccess}
                >
                  Solicitar acesso
                </button>
              </p>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
                    <input className="h-11 w-full rounded-md border border-hairline-strong px-3 pr-11 outline-none focus:border-metalique" type={showNewPassword ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
                    <button className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-muted" type="button" onClick={() => setShowNewPassword((current) => !current)} aria-label={showNewPassword ? "Ocultar senha" : "Mostrar senha"}>{showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                  </div>
                </label>
                <label className="block text-sm font-medium">Confirmar nova senha
                  <div className="relative mt-1.5">
                    <input className="h-11 w-full rounded-md border border-hairline-strong px-3 pr-11 outline-none focus:border-metalique" type={showConfirmation ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
                    <button className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-muted" type="button" onClick={() => setShowConfirmation((current) => !current)} aria-label={showConfirmation ? "Ocultar senha" : "Mostrar senha"}>{showConfirmation ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                  </div>
                </label>
                <p className="text-xs text-ink-muted">Use no mínimo 8 caracteres, com número e caractere especial.</p>
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
                <input className="mt-1.5 h-11 w-full rounded-md border border-hairline-strong px-3 outline-none focus:border-metalique" type="email" autoComplete="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} required />
              </label>
              <DialogFooter className="mt-6">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={isResetSubmitting || !csrfToken}>{isResetSubmitting && <LoaderCircle className="animate-spin" />}{isResetSubmitting ? "Enviando..." : "Solicitar recuperação"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
