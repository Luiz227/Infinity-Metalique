import type { AnchorHTMLAttributes, ReactNode } from "react"
import { Construction } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function DevelopmentNoticeLink({ area, children, onClick, ...props }: {
  area: string
  children: ReactNode
} & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <a
          href={`#${area.toLocaleLowerCase("pt-BR")}`}
          {...props}
          onClick={(event) => {
            event.preventDefault()
            onClick?.(event)
          }}
        >
          {children}
        </a>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <span className="mb-2 grid size-11 place-items-center rounded-full bg-red-50 text-[#db0f0f]" aria-hidden="true">
            <Construction className="size-5" />
          </span>
          <DialogTitle>Área em desenvolvimento</DialogTitle>
          <DialogDescription>A área de {area} ainda está em desenvolvimento.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">Entendi</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
