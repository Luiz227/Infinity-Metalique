import { useEffect, useState } from "react"
import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react"

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
import { postJson, readJson } from "@/lib/api"

/** Uma aba do módulo. Sem `group`, ela é só uma visão de outras abas. */
export type PurgeTab = {
  id: string
  label: string
  group: string | null
  /** As abas donas dos dados que esta apenas exibe. */
  sources: string[]
  description?: string
  rows?: number
  /** Arquivos em disco que caem junto - hoje, as fotos das coletas. */
  files?: number
  /** Cadastro não cai sozinho: os lançamentos vivos ficariam sem cliente. */
  requiresAll?: boolean
  /** Grupos que caem junto com este, por cascata do banco. */
  cascades?: string[]
}

/** Dado do módulo que não aparece em aba nenhuma. */
export type PurgeExtra = {
  group: string
  label?: string
  description: string
  rows: number
  files: number
  requiresAll: boolean
  cascades?: string[]
}

export type PurgeSector = {
  id: string
  label: string
  /** O que precisa ser digitado para destravar - o servidor confere o mesmo. */
  confirmation: string
  tabs: PurgeTab[]
  extras: PurgeExtra[]
}

/** O que a pessoa marcou, já achatado para o diálogo. */
export type PurgeChoice = { key: string; label: string; rows: number; files: number }

type Prepared = { token: string; filename: string; sizeBytes: number }
type PurgedCount = { key: string; label: string; rows: number }
type Purged = { message: string; counts: PurgedCount[]; rows: number; photos: number; archive: string }

/**
 * As etapas, na ordem em que acontecem. Elas existem separadas porque cada uma
 * é um request diferente, e é essa separação que sustenta a promessa da tela:
 * a exclusão só é pedida depois que o backup já está no disco de quem clicou.
 */
type Stage = "idle" | "preparing" | "downloading" | "deleting" | "done"

/**
 * Entrega o arquivo a quem clicou e devolve quantos bytes chegaram.
 *
 * O tamanho volta ao servidor na confirmação: é ele que prova que o backup
 * chegou inteiro. Falhar aqui - rede, aba fechada, resposta truncada - deixa a
 * exclusão sem acontecer, porque o passo seguinte nunca é pedido.
 */
async function baixar(token: string, filename: string, csrfToken: string): Promise<number> {
  const response = await fetch("/backend/api/admin/sector-purge-download.php", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, csrfToken }),
  })
  if (!response.ok) {
    await readJson(response)
    throw new Error("Não foi possível baixar o backup. Nada foi apagado.")
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    const link = document.createElement("a")
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    // Num quadro à frente: revogar na mesma volta cancelaria o download que
    // o clique acabou de começar.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }

  return blob.size
}

export function SectorPurgeDialog({ sector, choices, csrfToken, open, onOpenChange, onPurged }: {
  sector: PurgeSector
  /** O que foi marcado na seção, já na ordem em que o servidor declara. */
  choices: PurgeChoice[]
  csrfToken: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPurged: () => void
}) {
  const [confirmation, setConfirmation] = useState("")
  const [password, setPassword] = useState("")
  const [stage, setStage] = useState<Stage>("idle")
  const [error, setError] = useState("")
  const [result, setResult] = useState<Purged | null>(null)

  const isWorking = stage === "preparing" || stage === "downloading" || stage === "deleting"
  const matches = confirmation.trim().toUpperCase() === sector.confirmation
  const rows = choices.reduce((total, item) => total + item.rows, 0)
  const photos = choices.reduce((total, item) => total + item.files, 0)
  const levaCadastros = choices.some((item) => item.key === "cadastros")

  useEffect(() => {
    if (!open) return
    setConfirmation("")
    setPassword("")
    setStage("idle")
    setError("")
    setResult(null)
  }, [open])

  const run = async () => {
    if (!matches || isWorking) return

    setError("")
    setStage("preparing")
    try {
      const prepared = await postJson<Prepared>("/backend/api/admin/sector-purge-prepare.php", {
        csrfToken,
        sector: sector.id,
        groups: choices.map((item) => item.key),
        confirmation: confirmation.trim(),
        password,
      })

      setStage("downloading")
      const receivedBytes = await baixar(prepared.token, prepared.filename, csrfToken)

      setStage("deleting")
      setResult(await postJson<Purged>("/backend/api/admin/sector-purge-confirm.php", {
        csrfToken, token: prepared.token, receivedBytes,
      }))
      setStage("done")
      onPurged()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível concluir.")
      setStage("idle")
      setPassword("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isWorking) onOpenChange(next) }}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        showCloseButton={!isWorking}
      >
        {stage === "done" && result ? (
          <>
            <DialogHeader>
              <div className="mb-1 grid size-11 place-items-center rounded-full bg-green-50 text-green-800">
                <CheckCircle2 className="size-6" aria-hidden="true" />
              </div>
              <DialogTitle>Dados apagados</DialogTitle>
              <DialogDescription>{result.message}</DialogDescription>
            </DialogHeader>

            <dl className="max-h-56 overflow-y-auto rounded-md border border-hairline text-sm">
              {result.counts.map((item) => (
                <div key={item.key} className="flex justify-between border-b border-hairline px-3 py-2 last:border-b-0">
                  <dt className="text-ink-soft">{item.label}</dt>
                  <dd className="font-medium tabular-nums text-ink">{item.rows}</dd>
                </div>
              ))}
            </dl>

            {result.photos > 0 && (
              <p className="text-[13px] leading-5 text-ink-muted">
                O backup foi baixado para esta máquina. No servidor, as {result.photos} foto(s)
                das coletas ficaram guardadas em{" "}
                <code className="rounded bg-neutral-100 px-1 py-0.5 text-[12px]">{result.archive}</code>.
                Apague essa pasta quando tiver certeza.
              </p>
            )}

            <DialogFooter>
              <DialogClose asChild><Button type="button">Concluir</Button></DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-1 grid size-11 place-items-center rounded-full bg-red-50 text-red-700">
                <TriangleAlert className="size-6" aria-hidden="true" />
              </div>
              <DialogTitle>
                {choices.length === 1
                  ? `Apagar ${choices[0].label} da ${sector.label}?`
                  : `Apagar ${choices.length} itens da ${sector.label}?`}
              </DialogTitle>
              <DialogDescription>
                {rows} registro(s){photos > 0 ? ` e ${photos} foto(s)` : ""}.
                {" "}Esta ação é permanente: depois dela, o backup é a única volta.
              </DialogDescription>
            </DialogHeader>

            <dl className="rounded-md border border-red-200 bg-red-50 text-sm">
              {choices.map((item) => (
                <div
                  key={item.key}
                  className="flex justify-between border-b border-red-200 px-3 py-2 last:border-b-0"
                >
                  <dt className="text-red-800">{item.label}</dt>
                  <dd className="font-medium tabular-nums text-red-800">{item.rows}</dd>
                </div>
              ))}
            </dl>

            <ul className="space-y-1.5 text-[13px] leading-5 text-ink-muted">
              {levaCadastros && (
                <li>
                  Os cadastros saem junto. Gates e a meta mensal voltam ao padrão de instalação;
                  clientes, colaboradores, máquinas, modelos e códigos ficam vazios até serem
                  recadastrados.
                </li>
              )}
              <li>
                As tabelas do banco continuam existindo: só as linhas saem. O que não está
                marcado fica intacto, e o backup guarda o módulo inteiro de qualquer forma.
              </li>
              {choices.some((item) => item.key === "satisfacao") && (
                <li>Os planos de ação das reclamações apagadas saem junto — eles tratam delas.</li>
              )}
              {choices.some((item) => item.key === "raps") && (
                <li>Os códigos recomeçam do zero — o próximo apontamento volta a ser o RAP01.</li>
              )}
              {photos > 0 && (
                <li>As fotos das coletas saem da pasta pública e ficam guardadas no servidor.</li>
              )}
              <li>Contas, permissões e ramais não são afetados.</li>
            </ul>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink" htmlFor="purge-confirmation">
                  Digite {sector.confirmation} para confirmar
                </label>
                <Input
                  id="purge-confirmation"
                  className="mt-1.5"
                  value={confirmation}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isWorking}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink" htmlFor="purge-password">
                  Sua senha
                </label>
                <Input
                  id="purge-password"
                  className="mt-1.5"
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  disabled={isWorking}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </div>

            {error && (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isWorking}>Cancelar</Button>
              </DialogClose>
              <Button
                type="button"
                className="bg-red-700 hover:bg-red-800"
                disabled={!matches || password === "" || isWorking}
                onClick={() => { void run() }}
              >
                {isWorking ? <LoaderCircle className="animate-spin" /> : <TriangleAlert />}
                {stage === "preparing" && "Preparando o backup..."}
                {stage === "downloading" && "Baixando o backup..."}
                {stage === "deleting" && "Apagando..."}
                {stage === "idle" && "Baixar backup e apagar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
