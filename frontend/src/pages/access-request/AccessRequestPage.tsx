import { type ComponentProps, type FormEvent, useState } from "react"
import { CheckCircle2, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Scroller } from "@/components/ui/scroller"
import { postJson } from "@/lib/api"
import type { ApiResponse } from "@/types"

function Field({ id, label, ...props }: { id: string; label: string } & ComponentProps<typeof Input>) {
  return (
    <label className="block text-sm font-medium text-ink-soft" htmlFor={id}>
      {label}
      <Input className="mt-1.5 text-sm" id={id} {...props} />
    </label>
  )
}

export function AccessRequestPage({ csrfToken, onClose, onLogin }: {
  csrfToken: string
  onClose: () => void
  onLogin: () => void
}) {
  const [name, setName] = useState("")
  const [sector, setSector] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [admissionDate, setAdmissionDate] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const closeDialog = () => {
    if (isSubmitting) return
    onClose()
  }

  const openLogin = () => {
    if (isSubmitting) return
    setShowConfirmation(false)
    onLogin()
  }

  const submitAccessRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)

    try {
      await postJson<ApiResponse>("/backend/api/access-request.php", { csrfToken, name, sector, jobTitle, admissionDate })
      setName("")
      setSector("")
      setJobTitle("")
      setAdmissionDate("")
      setShowConfirmation(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) closeDialog() }}>
      <DialogContent
        className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-[35rem] flex-col gap-0 overflow-hidden rounded-[20px] border-hairline bg-surface p-0 shadow-[0_24px_80px_rgb(11_11_11/0.18)] sm:max-h-[calc(100dvh-3rem)]"
        showCloseButton={!isSubmitting}
        onEscapeKeyDown={(event) => { if (isSubmitting) event.preventDefault() }}
        onPointerDownOutside={(event) => { if (isSubmitting) event.preventDefault() }}
      >
        {showConfirmation ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="shrink-0 border-b border-hairline px-5 py-5 pr-14 sm:px-7 sm:py-6 sm:pr-16">
              <DialogTitle className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
                Solicitação enviada
              </DialogTitle>
              <DialogDescription className="text-ink-soft">
                Recebemos seus dados e sua solicitação será analisada pela equipe.
              </DialogDescription>
            </DialogHeader>

            <Scroller
              className="scroll-fade [--scroll-fade-size:1.5rem] min-h-0 flex-1 overflow-y-auto overscroll-contain"
              contentClassName="px-5 py-8 sm:px-7 sm:py-10"
            >
              <div className="mx-auto flex max-w-sm flex-col items-center text-center">
                <span className="grid size-14 place-items-center rounded-full bg-green-50 text-green-700" aria-hidden="true">
                  <CheckCircle2 className="size-7" strokeWidth={1.8} />
                </span>
                <p className="mt-5 text-base font-semibold text-ink">Que ótimo ter você na nossa equipe!</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Assim que o acesso for aprovado, você poderá entrar com os dados cadastrados pelo administrador.
                </p>
              </div>
            </Scroller>

            <DialogFooter className="shrink-0 border-t border-hairline bg-surface px-5 py-4 sm:px-7">
              <Button className="w-full rounded-full sm:w-auto" type="button" onClick={closeDialog}>
                Concluir
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitAccessRequest}>
            <DialogHeader className="shrink-0 border-b border-hairline px-5 py-5 pr-14 sm:px-7 sm:py-6 sm:pr-16">
              <DialogTitle className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
                Solicite seu acesso
              </DialogTitle>
              <DialogDescription className="text-ink-soft">
                Seu processo está a caminho de se tornar infinitamente melhor.
              </DialogDescription>
            </DialogHeader>

            <Scroller
              className="scroll-fade [--scroll-fade-size:1.5rem] min-h-0 flex-1 overflow-y-auto overscroll-contain"
              contentClassName="px-5 py-5 sm:px-7 sm:py-6"
            >
              {error && (
                <p className="mb-4 rounded-md border border-metalique/25 bg-red-50 p-3 text-sm font-medium text-[#a50b0b]" role="alert">
                  {error}
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field id="nome-completo" label="Nome completo" type="text" autoComplete="name" minLength={3} value={name} onChange={(event) => setName(event.target.value)} required />
                </div>
                <Field id="setor" label="Setor" type="text" autoComplete="organization" minLength={2} value={sector} onChange={(event) => setSector(event.target.value)} required />
                <Field id="cargo" label="Cargo" type="text" autoComplete="organization-title" minLength={2} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} required />
                <div className="sm:col-span-2">
                  <Field id="data-admissao" label="Data de admissão" type="date" autoComplete="off" max={new Date().toISOString().slice(0, 10)} value={admissionDate} onChange={(event) => setAdmissionDate(event.target.value)} required />
                </div>
              </div>
            </Scroller>

            <DialogFooter className="shrink-0 flex-col gap-3 border-t border-hairline bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <button
                className="min-h-10 text-sm text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metalique/20 disabled:pointer-events-none disabled:opacity-50"
                type="button"
                onClick={openLogin}
                disabled={isSubmitting}
              >
                Já possui acesso? <span className="font-semibold text-metalique">Entrar</span>
              </button>
              <Button className="w-full rounded-full sm:w-auto" type="submit" disabled={isSubmitting || !csrfToken}>
                {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {isSubmitting ? "Enviando..." : "Solicitar acesso"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
