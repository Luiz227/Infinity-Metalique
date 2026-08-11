import { useState } from "react"
import { AlertCircle, CheckCircle2, LoaderCircle, Trash2 } from "lucide-react"

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

export type RecordKind = "report" | "dispatch"
export type RecordTarget = { kind: RecordKind; id: number; code: string }
export type DeleteResult = { success: boolean; message: string }

export function RecordDeleteButton({ target, onSelect }: {
  target: RecordTarget
  onSelect: (target: RecordTarget) => void
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
      onClick={() => onSelect(target)}
      aria-label={`Excluir ${target.code}`}
    >
      <Trash2 className="size-3.5" /> Excluir
    </button>
  )
}

export function RecordDeleteDialog({ target, onOpenChange, onDelete }: {
  target: RecordTarget | null
  onOpenChange: (target: RecordTarget | null) => void
  onDelete: (kind: RecordKind, id: number) => Promise<DeleteResult>
}) {
  const [result, setResult] = useState<DeleteResult | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const confirmDelete = async () => {
    if (!target || isDeleting) return

    setIsDeleting(true)
    setResult(null)
    const response = await onDelete(target.kind, target.id)
    setResult(response)
    setIsDeleting(false)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open && !isDeleting) {
      setResult(null)
      onOpenChange(null)
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isDeleting}>
        {result?.success ? (
          <>
            <DialogHeader>
              <div className="mb-1 grid size-11 place-items-center rounded-full bg-green-50 text-green-700">
                <CheckCircle2 className="size-6" aria-hidden="true" />
              </div>
              <DialogTitle>Registro excluído</DialogTitle>
              <DialogDescription>{result.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button">Concluir</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-1 grid size-11 place-items-center rounded-full bg-red-50 text-red-700">
                <AlertCircle className="size-6" aria-hidden="true" />
              </div>
              <DialogTitle>Excluir {target?.code}?</DialogTitle>
              <DialogDescription>
                Esta ação é permanente e não pode ser desfeita.
                {target?.kind === "dispatch" && " As fotos vinculadas ao RETIR também serão removidas."}
              </DialogDescription>
            </DialogHeader>

            {result && !result.success && (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
                {result.message}
              </p>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isDeleting}>Cancelar</Button>
              </DialogClose>
              <Button
                type="button"
                className="bg-red-700 hover:bg-red-800"
                onClick={() => { void confirmDelete() }}
                disabled={isDeleting}
              >
                {isDeleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                {isDeleting ? "Excluindo..." : "Excluir registro"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
