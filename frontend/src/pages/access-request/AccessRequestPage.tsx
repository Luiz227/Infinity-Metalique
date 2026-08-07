import { type FormEvent, useState } from "react"
import { LoaderCircle } from "lucide-react"

import { postJson } from "@/lib/api"
import type { ApiResponse } from "@/types"
import { AuthVisual, RedLines } from "@/components/auth/AuthVisual"

export function AccessRequestPage({ csrfToken }: { csrfToken: string }) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const submitAccessRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)

    try {
      await postJson<ApiResponse>("/backend/api/access-request.php", { csrfToken, email: email.trim(), name, password })
      setEmail("")
      setName("")
      setPassword("")
      setShowConfirmation(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <main className="page-frame login-frame registration-page">
        <AuthVisual accessRequest />
        <section className="login-content registration-content">
          <img className="login-logo" src="/images/logo.svg" alt="Metalique Infinity" />
          <form className="login-form registration-form" id="access-request-form" onSubmit={submitAccessRequest}>
            {error && <p className="form-feedback" role="alert">{error}</p>}
            <div className="form-field">
              <label htmlFor="email-recuperacao">E-mail corporativo</label>
              <input id="email-recuperacao" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="form-field">
              <label htmlFor="nome-completo">Nome Completo</label>
              <input id="nome-completo" type="text" autoComplete="name" minLength={3} value={name} onChange={(event) => setName(event.target.value)} required />
            </div>
            <div className="form-field">
              <label htmlFor="senha-preferencia">Senha de preferência</label>
              <input id="senha-preferencia" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <p className="registration-notice">Use uma senha com pelo menos 8 caracteres.</p>
          </form>
          <button className="login-button" type="submit" form="access-request-form" disabled={isSubmitting || !csrfToken}>
            {isSubmitting ? <LoaderCircle className="mx-auto size-6 animate-spin" aria-label="Enviando" /> : "Solicitar acesso"}
          </button>
          <RedLines />
        </section>
      </main>

      {showConfirmation && (
        <div className="confirmation-modal" role="dialog" aria-modal="true" aria-label="Solicitação requisitada com sucesso">
          <section className="confirmation-card">
            <img className="confirmation-art" src="/images/confirmacao-cadastro.png" alt="Sua solicitação foi requisitada com sucesso. Que ótimo ter você na nossa equipe!" />
            <button className="close-modal" type="button" aria-label="Fechar confirmação" onClick={() => setShowConfirmation(false)}>×</button>
          </section>
        </div>
      )}
    </>
  )
}
