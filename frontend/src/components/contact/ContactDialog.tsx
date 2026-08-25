import { ContactDirectory } from "@/components/contact/ContactDirectory"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * Os ramais em modal, abertos pelo menu do perfil.
 *
 * Mesmas medidas da central de configurações: altura com teto na janela, `p-0`
 * no conteúdo e o recuo por dentro, para o respiro de baixo entrar na conta da
 * rolagem em vez de virar um pedaço morto no fim.
 */
export function ContactDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(620px,calc(100dvh-2rem))] w-[calc(100%-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 gap-1 border-b border-hairline px-6 py-5 pr-14">
          <DialogTitle>Ramais</DialogTitle>
          <DialogDescription>Os ramais internos da Metalique, por prédio e andar.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
          <ContactDirectory variant="dialog" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
