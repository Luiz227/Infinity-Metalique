import { type FormEvent, useState } from "react"
import { Eye, EyeOff, LoaderCircle } from "lucide-react"

import { postJson } from "@/lib/api"
import type { ApiResponse, User } from "@/types"
import { AuthVisual, RedLines } from "@/components/auth/AuthVisual"

export function LoginPage({ csrfToken, onAuthenticated }: { csrfToken: string; onAuthenticated: (user: User) => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
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

  return (
    <main className="page-frame login-frame">
      <AuthVisual />
      <section className="login-content">
        <img className="login-logo" src="/images/logo.svg" alt="Metalique Infinity" />
        <form className="login-form" id="login-form" onSubmit={submitLogin}>
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
          <a className="forgot-password" href="#recuperar-senha">Esqueceu sua senha?</a>
        </form>
        <button className="login-button" type="submit" form="login-form" disabled={isSubmitting || !csrfToken}>
          {isSubmitting ? <LoaderCircle className="mx-auto size-6 animate-spin" aria-label="Entrando" /> : "Entrar"}
        </button>
        <RedLines />
      </section>
    </main>
  )
}
