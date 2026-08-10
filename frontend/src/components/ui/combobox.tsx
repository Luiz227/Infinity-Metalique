import { useState } from "react"
import { Check, ChevronDown, Plus, X } from "lucide-react"

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * Campo de escolha com busca. Substitui o `<datalist>` nativo nos campos que
 * precisam aceitar um valor novo — um cliente que ainda não está cadastrado é
 * criado justamente digitando aqui, então a entrada livre não pode se perder.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Selecione",
  searchPlaceholder = "Buscar...",
  emptyLabel = "Nada encontrado.",
  allowCreate = false,
  clearable = false,
  id,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  /** Permite usar o texto digitado como valor, mesmo fora da lista. */
  allowCreate?: boolean
  clearable?: boolean
  id?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const trimmed = query.trim()
  const jaExiste = options.some((option) => option.toLowerCase() === trimmed.toLowerCase())
  const podeCriar = allowCreate && trimmed !== "" && !jaExiste

  const escolher = (novo: string) => {
    onChange(novo)
    setQuery("")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        data-slot="combobox-trigger"
        type="button"
        role="combobox"
        aria-expanded={open}
        className={cn(
          "group flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-black/10 bg-white px-3 text-sm outline-none transition-colors",
          "hover:border-black/20 focus-visible:ring-2 focus-visible:ring-[#db0f0f]/35 data-[state=open]:border-[#db0f0f]/40",
          value ? "text-[#0b0b0b]" : "text-[#898781]",
          className,
        )}
      >
        <span className="line-clamp-1 text-left">{value || placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-[#898781] transition-transform duration-150 group-data-[state=open]:rotate-180" />
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[16rem]">
        <Command
          // A filtragem já é feita pelo cmdk; só a linha de "usar o que foi digitado"
          // precisa aparecer mesmo sem nenhuma correspondência.
          filter={(itemValue, search) =>
            itemValue.startsWith("__criar__") || itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {!podeCriar && <CommandEmpty>{emptyLabel}</CommandEmpty>}

            {podeCriar && (
              <CommandGroup>
                <CommandItem value={`__criar__${trimmed}`} onSelect={() => escolher(trimmed)}>
                  <Plus className="size-4 text-[#db0f0f]" />
                  Usar <span className="font-medium">“{trimmed}”</span>
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup>
              {clearable && value !== "" && (
                <CommandItem value="__limpar__" onSelect={() => escolher("")}>
                  <X className="size-4 text-[#898781]" />
                  Limpar seleção
                </CommandItem>
              )}

              {options.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => escolher(option)}>
                  <Check className={cn("size-4 shrink-0 text-[#db0f0f]", option === value ? "opacity-100" : "opacity-0")} />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
