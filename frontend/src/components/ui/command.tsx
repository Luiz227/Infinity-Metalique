import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { Search } from "lucide-react"

import { useSmoothScroll } from "@/lib/smoothScroll"
import { cn } from "@/lib/utils"

/** Lista com busca do shadcn (cmdk), usada pelo Combobox. */

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn("flex w-full flex-col overflow-hidden rounded-xl bg-white text-ink", className)}
      {...props}
    />
  )
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-[#f0efec] px-3">
      <Search className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <CommandPrimitive.Input
        className={cn(
          "h-10 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  const listRef = React.useRef<HTMLDivElement | null>(null)

  // Único lugar que não usa o <Scroller>: o cmdk já desenha por dentro o
  // `[cmdk-list-sizer]`, que serve de elemento de conteúdo para o Lenis. Um
  // nível a mais aqui ficaria entre a lista e o sizer que o próprio cmdk
  // procura para ordenar e filtrar os itens.
  //
  // A navegação por setas continua funcionando: o cmdk move a seleção com
  // `scrollIntoView`, e o Lenis reconcilia escritas nativas de scrollTop desde
  // que não esteja no meio da própria animação.
  useSmoothScroll(listRef, "[cmdk-list-sizer]")

  return (
    <CommandPrimitive.List
      ref={listRef}
      className={cn("scroll-fade [--scroll-fade-size:1.25rem] max-h-64 overflow-y-auto overflow-x-hidden p-1", className)}
      {...props}
    />
  )
}

function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="px-3 py-4 text-center text-sm text-ink-muted" {...props} />
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        "text-ink [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
        "[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase",
        "[&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-muted",
        className,
      )}
      {...props}
    />
  )
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none",
        "data-[selected=true]:bg-metalique/10 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList }
