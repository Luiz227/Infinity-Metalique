import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Download,
  FileImage,
  FileText,
  Folder,
  GitBranch,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
  Upload,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getJson, postForm, postJson } from "@/lib/api"
import type { User } from "@/types"

type DocumentItem = {
  id: number
  title: string
  category: string
  sector: string
  originalName: string
  extension: string
  sizeBytes: number
  version: number
  kind: "word" | "pdf" | "image"
  canEdit: boolean
  canDelete: boolean
  canShare: boolean
  authorizedEditorIds: number[]
  createdById: number
  createdBy: string | null
  updatedBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

type DocumentCollaborator = { id: number; name: string; sector: string }

type EditorPayload = {
  editorScript: string
  config: Record<string, unknown>
}

type OnlyOfficeEditor = { destroyEditor: () => void; requestClose: () => void }
type OnlyOfficeConstructor = new (elementId: string, config: Record<string, unknown>) => OnlyOfficeEditor

declare global {
  interface Window {
    DocsAPI?: { DocEditor: OnlyOfficeConstructor }
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  word: "Word",
  pdf: "PDF",
  foto: "Fotos",
  procedimento: "Procedimentos",
  mapa: "Mapas",
  diagrama: "Diagramas",
  fluxograma: "Fluxogramas",
  organograma: "Organogramas",
  outro: "Outros",
}

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

let onlyOfficeScriptPromise: Promise<void> | null = null

function loadOnlyOfficeScript(source: string): Promise<void> {
  if (window.DocsAPI?.DocEditor) return Promise.resolve()
  if (onlyOfficeScriptPromise) return onlyOfficeScriptPromise

  const loadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-onlyoffice-api]")
    const script = existing || document.createElement("script")
    const loaded = () => window.DocsAPI?.DocEditor
      ? resolve()
      : reject(new Error("O editor de documentos não respondeu."))
    script.addEventListener("load", loaded, { once: true })
    script.addEventListener("error", () => reject(new Error("Não foi possível carregar o editor de documentos.")), { once: true })
    if (!existing) {
      script.src = source
      script.async = true
      script.dataset.onlyofficeApi = "true"
      document.head.appendChild(script)
    }
  })
  const result = loadingPromise.catch((error) => {
    document.querySelector<HTMLScriptElement>("script[data-onlyoffice-api]")?.remove()
    onlyOfficeScriptPromise = null
    throw error
  })
  onlyOfficeScriptPromise = result

  return result
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string | null): string {
  if (!value) return "Data indisponível"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
}

function DocumentEditor({ documentItem, csrfToken, onClose }: { documentItem: DocumentItem; csrfToken: string; onClose: () => void }) {
  const editorRef = useRef<OnlyOfficeEditor | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const closedRef = useRef(false)
  const closingRef = useRef(false)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [message, setMessage] = useState("Preparando o documento...")
  const [closing, setClosing] = useState(false)

  const finishClose = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    editorRef.current?.destroyEditor()
    editorRef.current = null
    onClose()
  }, [onClose])

  useEffect(() => {
    let active = true

    const open = async () => {
      try {
        const payload = await getJson<EditorPayload>(`/backend/api/documents/editor-config.php?id=${documentItem.id}`, { cache: "no-store" })
        await loadOnlyOfficeScript(payload.editorScript)
        if (!active || !window.DocsAPI?.DocEditor) return

        const config = {
          ...payload.config,
          events: {
            onAppReady: () => active && setState("ready"),
            onDocumentReady: () => active && setState("ready"),
            onDocumentStateChange: (event: { data?: boolean }) => {
              if (!active || closingRef.current) return
              setMessage(event.data ? "Alterações pendentes" : "Alterações salvas")
            },
            onRequestClose: finishClose,
            onError: () => {
              if (!active) return
              setMessage("O editor não conseguiu abrir este documento.")
              setState("error")
            },
          },
        }
        editorRef.current = new window.DocsAPI.DocEditor("onlyoffice-document-editor", config)
      } catch (error) {
        if (!active) return
        setMessage(error instanceof Error ? error.message : "Não foi possível abrir o documento.")
        setState("error")
      }
    }

    void open()
    return () => {
      active = false
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
      editorRef.current?.destroyEditor()
      editorRef.current = null
    }
  }, [documentItem.id, finishClose])

  const closeSafely = async () => {
    if (closing) return
    if (!documentItem.canEdit || state !== "ready") {
      finishClose()
      return
    }

    setClosing(true)
    closingRef.current = true
    setMessage("Salvando alterações...")
    try {
      await postJson("/backend/api/documents/force-save.php", { csrfToken, id: documentItem.id })
      await new Promise((resolve) => window.setTimeout(resolve, 1200))
      editorRef.current?.requestClose()
      closeTimerRef.current = window.setTimeout(finishClose, 6000)
    } catch (saveError) {
      closingRef.current = false
      setClosing(false)
      setMessage(saveError instanceof Error ? saveError.message : "Não foi possível confirmar o salvamento.")
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex min-h-16 items-center gap-3 border-b border-hairline px-4 sm:px-6">
        <Button size="icon" variant="ghost" type="button" disabled={closing} onClick={() => void closeSafely()} title="Salvar e voltar" aria-label="Salvar e voltar aos documentos">
          {closing ? <LoaderCircle className="animate-spin" /> : <ArrowLeft />}
        </Button>
        <FileText className="size-5 shrink-0 text-metalique" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{documentItem.title}</p>
          <p className="truncate text-xs text-ink-muted">{closing || state !== "ready" || message !== "Preparando o documento..." ? message : "Alterações salvas automaticamente"}</p>
        </div>
        <a
          className="inline-flex size-9 items-center justify-center rounded-md text-ink-muted hover:bg-neutral-100 hover:text-ink"
          href={`/backend/api/documents/download.php?id=${documentItem.id}`}
          title="Baixar documento"
          aria-label="Baixar documento"
        >
          <Download className="size-4" />
        </a>
      </div>

      <div className="relative min-h-0 flex-1 bg-neutral-100">
        <div id="onlyoffice-document-editor" className="size-full" />
        {state !== "ready" && (
          <div className="absolute inset-0 grid place-items-center bg-surface">
            <div className="max-w-sm px-6 text-center">
              {state === "loading" ? <LoaderCircle className="mx-auto size-7 animate-spin text-metalique" /> : <FileText className="mx-auto size-8 text-metalique" />}
              <p className="mt-3 text-sm font-medium">{message}</p>
              {state === "error" && <Button className="mt-5" variant="outline" type="button" onClick={finishClose}>Voltar</Button>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ImageDocumentViewer({ documentItem, onClose }: { documentItem: DocumentItem; onClose: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex min-h-16 items-center gap-3 border-b border-hairline px-4 sm:px-6">
        <Button size="icon" variant="ghost" type="button" onClick={onClose} title="Voltar aos documentos" aria-label="Voltar aos documentos"><ArrowLeft /></Button>
        <FileImage className="size-5 text-metalique" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{documentItem.title}</p>
        <a className="inline-flex size-9 items-center justify-center rounded-md text-ink-muted hover:bg-neutral-100 hover:text-ink" href={`/backend/api/documents/download.php?id=${documentItem.id}`} title="Baixar foto" aria-label="Baixar foto"><Download className="size-4" /></a>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-neutral-100 p-5">
        <img className="max-h-full max-w-full object-contain" src={`/backend/api/documents/preview.php?id=${documentItem.id}`} alt={documentItem.title} />
      </div>
    </div>
  )
}

function UploadDialog({ open, csrfToken, onOpenChange, onUploaded }: {
  open: boolean
  csrfToken: string
  onOpenChange: (open: boolean) => void
  onUploaded: (document: DocumentItem) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("word")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const chooseFile = (selectedFile: File | null) => {
    setError("")
    if (selectedFile && selectedFile.size > MAX_DOCUMENT_BYTES) {
      setFile(null)
      setError("O arquivo deve ter no máximo 25 MB.")
      return
    }
    setFile(selectedFile)
    const extension = selectedFile?.name.split(".").pop()?.toLocaleLowerCase("pt-BR")
    if (["doc", "docx"].includes(extension || "")) setCategory("word")
    if (extension === "pdf") setCategory("pdf")
    if (["jpg", "jpeg", "png", "webp"].includes(extension || "")) setCategory("foto")
  }

  const upload = async () => {
    if (!file) {
      setError("Escolha um arquivo Word, PDF ou uma foto.")
      return
    }

    setSaving(true)
    setError("")
    const form = new FormData()
    form.set("csrfToken", csrfToken)
    form.set("file", file)
    form.set("title", title)
    form.set("category", category)

    try {
      const payload = await postForm<{ document: DocumentItem }>("/backend/api/documents/upload.php", form)
      onUploaded(payload.document)
      onOpenChange(false)
      setFile(null)
      setTitle("")
      setCategory("word")
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Não foi possível importar o documento.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar documento</DialogTitle>
          <DialogDescription>O documento ficará organizado automaticamente na pasta do seu setor.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            Arquivo Word, PDF ou foto
            <input
              className="h-11 rounded-md border border-hairline bg-surface px-3 text-sm file:mr-3 file:border-0 file:bg-transparent file:font-semibold file:text-metalique"
              type="file"
              accept=".doc,.docx,.pdf,.jpg,.jpeg,.png,.webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => chooseFile(event.target.files?.[0] || null)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Título
            <input className="h-11 rounded-md border border-hairline bg-surface px-3 outline-none focus:border-metalique" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Usar o nome do arquivo" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Tipo
            <select className="h-11 rounded-md border border-hairline bg-surface px-3 outline-none focus:border-metalique" value={category} onChange={(event) => setCategory(event.target.value)}>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {error && <p className="text-sm text-metalique" role="alert">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={saving} onClick={upload}>
            {saving ? <LoaderCircle className="animate-spin" /> : <Upload />}
            {saving ? "Importando..." : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ShareDialog({ documentItem, users, csrfToken, onClose, onSaved }: {
  documentItem: DocumentItem | null
  users: DocumentCollaborator[]
  csrfToken: string
  onClose: () => void
  onSaved: (documentItem: DocumentItem) => void
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => setSelectedIds(documentItem?.authorizedEditorIds || []), [documentItem])

  const save = async () => {
    if (!documentItem) return
    setSaving(true)
    setError("")
    try {
      const payload = await postJson<{ document: DocumentItem }>("/backend/api/documents/share.php", {
        csrfToken,
        id: documentItem.id,
        editorIds: selectedIds,
      })
      onSaved(payload.document)
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível atualizar as autorizações.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={Boolean(documentItem)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Autorizar edição</DialogTitle>
          <DialogDescription>Os usuários escolhidos poderão alterar este documento. Os demais continuarão somente visualizando.</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto border-y border-hairline py-2">
          {users.filter((candidate) => candidate.id !== documentItem?.createdById).map((candidate) => {
            const checked = selectedIds.includes(candidate.id)
            return (
              <label key={candidate.id} className="flex cursor-pointer items-center gap-3 px-2 py-2 hover:bg-neutral-50">
                <input
                  className="size-4 accent-metalique"
                  type="checkbox"
                  checked={checked}
                  onChange={() => setSelectedIds((current) => checked ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{candidate.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{candidate.sector}</span>
                </span>
              </label>
            )
          })}
        </div>
        {error && <p className="text-sm text-metalique" role="alert">{error}</p>}
        <DialogFooter>
          <Button variant="outline" type="button" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle className="animate-spin" /> : <Share2 />}{saving ? "Salvando..." : "Salvar autorizações"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DocumentsPage({ csrfToken, user }: { csrfToken: string; user: User }) {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [collaborators, setCollaborators] = useState<DocumentCollaborator[]>([])
  const [selected, setSelected] = useState<DocumentItem | null>(null)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("todos")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<DocumentItem | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [payload, collaboratorPayload] = await Promise.all([
        getJson<{ documents: DocumentItem[] }>("/backend/api/documents/index.php", { cache: "no-store" }),
        getJson<{ users: DocumentCollaborator[] }>("/backend/api/documents/collaborators.php", { cache: "no-store" }),
      ])
      setDocuments(payload.documents)
      setCollaborators(collaboratorPayload.users)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os documentos.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR")
    return documents.filter((documentItem) => (
      (category === "todos" || documentItem.category === category)
      && (!normalized || `${documentItem.title} ${documentItem.originalName}`.toLocaleLowerCase("pt-BR").includes(normalized))
    ))
  }, [category, documents, search])

  const groupedBySector = useMemo(() => {
    const groups = new Map<string, DocumentItem[]>()
    visible.forEach((documentItem) => {
      const sector = documentItem.sector.trim() || "Não informado"
      groups.set(sector, [...(groups.get(sector) || []), documentItem])
    })
    return Array.from(groups.entries())
  }, [visible])

  const remove = async (documentItem: DocumentItem) => {
    if (!window.confirm(`Excluir “${documentItem.title}”? Esta ação não pode ser desfeita.`)) return
    setDeletingId(documentItem.id)
    try {
      await postJson("/backend/api/documents/delete.php", { csrfToken, id: documentItem.id })
      setDocuments((current) => current.filter((item) => item.id !== documentItem.id))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir o documento.")
    } finally {
      setDeletingId(null)
    }
  }

  if (selected?.kind === "image") return <ImageDocumentViewer documentItem={selected} onClose={() => setSelected(null)} />
  if (selected) return <DocumentEditor documentItem={selected} csrfToken={csrfToken} onClose={() => { setSelected(null); void load() }} />

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-hairline px-[5%] py-6 lg:px-[1.7%]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Documentados</h1>
            <p className="mt-1 text-sm text-ink-muted">Documentos e mídias organizados por setor.</p>
          </div>
          <Button type="button" onClick={() => setUploadOpen(true)}><Plus />Importar arquivo</Button>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <label className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input className="h-10 w-full rounded-md border border-hairline bg-surface pl-9 pr-3 text-sm outline-none focus:border-metalique" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar documentos" />
          </label>
          <select className="h-10 rounded-md border border-hairline bg-surface px-3 text-sm outline-none focus:border-metalique" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filtrar por tipo">
            <option value="todos">Todos os tipos</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[5%] py-5 lg:px-[1.7%]">
        {error && <div className="mb-4 rounded-md border border-metalique/30 bg-red-50 px-4 py-3 text-sm text-metalique" role="alert">{error}</div>}
        {loading ? (
          <div className="grid min-h-48 place-items-center"><LoaderCircle className="size-6 animate-spin text-metalique" aria-label="Carregando documentos" /></div>
        ) : visible.length === 0 ? (
          <div className="grid min-h-64 place-items-center border-y border-hairline text-center">
            <div>
              <FileText className="mx-auto size-9 text-ink-muted" />
              <p className="mt-3 font-semibold">Nenhum documento encontrado</p>
              <p className="mt-1 text-sm text-ink-muted">{documents.length ? "Ajuste a busca ou o filtro." : "Importe o primeiro documento do seu setor."}</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6">
            {groupedBySector.map(([sector, sectorDocuments]) => (
              <section key={sector} aria-labelledby={`sector-${sector}`}>
                <div className="flex items-center gap-2 border-b border-hairline pb-2">
                  <Folder className="size-5 text-metalique" />
                  <h2 id={`sector-${sector}`} className="font-semibold">{sector}</h2>
                  <span className="text-xs text-ink-muted">{sectorDocuments.length}</span>
                </div>
                <div className="divide-y divide-hairline">
                {sectorDocuments.map((documentItem) => (
              <div key={documentItem.id} className="flex min-h-20 items-center gap-4 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-red-50 text-metalique">
                  {documentItem.kind === "image" ? <FileImage className="size-5" /> : documentItem.category === "fluxograma" || documentItem.category === "diagrama" ? <GitBranch className="size-5" /> : <FileText className="size-5" />}
                </span>
                <button className="min-w-0 flex-1 text-left" type="button" onClick={() => setSelected(documentItem)}>
                  <span className="block truncate text-sm font-semibold hover:text-metalique">{documentItem.title}</span>
                  <span className="mt-1 block truncate text-xs text-ink-muted">
                    {CATEGORY_LABELS[documentItem.category] || "Outros"} · {documentItem.extension.toUpperCase()} · {formatBytes(documentItem.sizeBytes)} · atualizado {formatDate(documentItem.updatedAt)}
                  </span>
                </button>
                <span className="hidden max-w-44 truncate text-xs text-ink-muted lg:block" title={documentItem.updatedBy || documentItem.createdBy || undefined}>
                  {documentItem.updatedBy || documentItem.createdBy || user.name}
                </span>
                <Button size="icon" variant="ghost" type="button" onClick={() => setSelected(documentItem)} title={documentItem.canEdit ? "Editar" : "Visualizar"} aria-label={documentItem.canEdit ? "Editar documento" : "Visualizar documento"}>
                  {documentItem.canEdit ? <Pencil /> : <FileText />}
                </Button>
                <a className="inline-flex size-9 items-center justify-center rounded-md text-metalique hover:bg-red-50" href={`/backend/api/documents/download.php?id=${documentItem.id}`} title="Baixar" aria-label="Baixar documento"><Download className="size-4" /></a>
                {documentItem.canShare && <Button size="icon" variant="ghost" type="button" onClick={() => setShareTarget(documentItem)} title="Autorizar editores" aria-label="Autorizar editores"><Share2 /></Button>}
                {documentItem.canDelete && (
                  <Button size="icon" variant="ghost" type="button" disabled={deletingId === documentItem.id} onClick={() => void remove(documentItem)} title="Excluir" aria-label="Excluir documento">
                    {deletingId === documentItem.id ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                  </Button>
                )}
              </div>
                ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <UploadDialog
        open={uploadOpen}
        csrfToken={csrfToken}
        onOpenChange={setUploadOpen}
        onUploaded={(documentItem) => setDocuments((current) => [documentItem, ...current])}
      />
      <ShareDialog
        documentItem={shareTarget}
        users={collaborators}
        csrfToken={csrfToken}
        onClose={() => setShareTarget(null)}
        onSaved={(updated) => setDocuments((current) => current.map((item) => item.id === updated.id ? updated : item))}
      />
    </div>
  )
}
