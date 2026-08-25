import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, FileSpreadsheet, History, LoaderCircle, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Scroller } from "@/components/ui/scroller"
import { getJson, postForm, postJson } from "@/lib/api"
import { HORIZONTAL_TABLE } from "@/lib/smoothScroll"

type ImportGroup = { key: string; label: string; total: number; added: number; updated: number }
type ImportSummary = {
  groups: ImportGroup[]
  catalogs: { employees: number; codes: number; productLines: number }
  errorCount: number
}
type PreviewPayload = { token: string; summary: ImportSummary; errors: string[] }
type HistoryItem = {
  fileName: string
  status: "pending" | "completed" | "failed"
  createdAt: string
  confirmedAt: string | null
  userName: string
}

export function QualityImportDialog({ open, csrfToken, onOpenChange, onImported }: {
  open: boolean
  csrfToken: string
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewPayload | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const loadHistory = useCallback(async () => {
    try {
      const payload = await getJson<{ items: HistoryItem[] }>("/backend/api/quality/import-history.php")
      setHistory(payload.items)
    } catch {
      setHistory([])
    }
  }, [])

  useEffect(() => {
    if (open) void loadHistory()
  }, [loadHistory, open])

  const createPreview = async () => {
    if (!file) {
      setError("Selecione a planilha de inspeção.")
      return
    }
    setError("")
    setNotice("")
    setPreview(null)
    setIsPreviewing(true)
    const form = new FormData()
    form.set("file", file)
    form.set("csrfToken", csrfToken)
    try {
      setPreview(await postForm<PreviewPayload>("/backend/api/quality/import-preview.php", form))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível analisar a planilha.")
    } finally {
      setIsPreviewing(false)
    }
  }

  const confirm = async () => {
    if (!preview) return
    setError("")
    setIsConfirming(true)
    try {
      const result = await postJson<{ message: string }>("/backend/api/quality/import-confirm.php", {
        token: preview.token,
        csrfToken,
      })
      setNotice(result.message)
      setPreview(null)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ""
      await loadHistory()
      onImported()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível importar a planilha.")
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isConfirming && onOpenChange(next)}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col overflow-hidden" showCloseButton={!isConfirming}>
        <DialogHeader>
          <DialogTitle>Importar dados da Qualidade</DialogTitle>
          <DialogDescription>
            Confira a prévia antes de atualizar. Registros que não estiverem na planilha serão preservados.
          </DialogDescription>
        </DialogHeader>

        {/* Quem rola é o miolo, não o cartão: mascarar o cartão inteiro
            desbotaria o fundo e a sombra dele nas pontas. De quebra, título e
            botões ficam sempre à vista. */}
        <Scroller
          className="scroll-fade [--scroll-fade-size:1.5rem] min-h-0 flex-1 overflow-y-auto"
          contentClassName="grid gap-5"
        >
          <div className="flex flex-col gap-3 rounded-md border border-hairline p-4 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-sm font-medium">
              Planilha Excel
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
                className="mt-2 block w-full rounded-md border border-hairline-strong bg-white px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:font-semibold file:text-metalique"
                onChange={(event) => {
                  setFile(event.target.files?.[0] || null)
                  setPreview(null)
                  setNotice("")
                  setError("")
                }}
              />
            </label>
            <Button type="button" variant="outline" onClick={() => void createPreview()} disabled={!file || isPreviewing || isConfirming}>
              {isPreviewing ? <LoaderCircle className="animate-spin" /> : <FileSpreadsheet />}
              {isPreviewing ? "Analisando..." : "Gerar prévia"}
            </Button>
          </div>

          {error && <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-[#b00c0c]">{error}</p>}
          {notice && <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><CheckCircle2 />{notice}</p>}

          {preview && (
            <section aria-label="Prévia da importação" className="overflow-hidden rounded-md border border-hairline">
              <div className="border-b border-hairline bg-[#f5f5f4] px-4 py-3">
                <h3 className="font-semibold">Prévia da atualização</h3>
                <p className="mt-1 text-xs text-ink-muted">Novo cria um registro; atualizar usa a chave existente e evita duplicidade.</p>
              </div>
              <Scroller className="overflow-x-auto" options={HORIZONTAL_TABLE}>
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-hairline text-xs uppercase text-ink-muted">
                    <tr><th className="px-4 py-3">Conjunto</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Novos</th><th className="px-4 py-3 text-right">Atualizar</th></tr>
                  </thead>
                  <tbody>
                    {preview.summary.groups.map((group) => (
                      <tr key={group.key} className="border-b border-black/5 last:border-0">
                        <td className="px-4 py-3 font-medium">{group.label}</td>
                        <td className="px-4 py-3 text-right">{group.total}</td>
                        <td className="px-4 py-3 text-right text-emerald-700">{group.added}</td>
                        <td className="px-4 py-3 text-right text-[#b00c0c]">{group.updated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroller>
              <p className="border-t border-hairline px-4 py-3 text-xs text-ink-muted">
                Catálogos encontrados: {preview.summary.catalogs.employees} colaboradores, {preview.summary.catalogs.codes} códigos e {preview.summary.catalogs.productLines} linhas de produto.
              </p>
              {preview.errors.length > 0 && (
                <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-semibold">{preview.summary.errorCount} linha(s) ignorada(s)</p>
                  <ul className="mt-2 space-y-1">{preview.errors.slice(0, 8).map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              )}
            </section>
          )}

          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><History />Importações recentes</h3>
            <div className="mt-2 divide-y divide-black/5 rounded-md border border-hairline">
              {history.length === 0 && <p className="px-4 py-3 text-sm text-ink-muted">Nenhuma importação registrada.</p>}
              {history.map((item, index) => (
                <div key={`${item.fileName}-${item.createdAt}-${index}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{item.fileName}</p><p className="text-xs text-ink-muted">{item.userName} · {new Date(item.createdAt).toLocaleString("pt-BR")}</p></div>
                  <span className={item.status === "completed" ? "text-emerald-700" : "text-amber-700"}>{item.status === "completed" ? "Concluída" : "Pendente"}</span>
                </div>
              ))}
            </div>
          </section>
        </Scroller>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isConfirming}>Fechar</Button>
          <Button type="button" onClick={() => void confirm()} disabled={!preview || isConfirming}>
            {isConfirming ? <LoaderCircle className="animate-spin" /> : <Upload />}
            {isConfirming ? "Importando..." : "Confirmar importação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
