import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      // A borda em repouso é hairline, não vermelha: o vermelho é sotaque de
      // ação, e um campo vazio não é uma ação. Ele volta no foco, junto do
      // anel - aí sim há algo acontecendo.
      className={cn(
        "h-11 w-full min-w-0 rounded-full border border-hairline bg-surface px-4 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-muted focus-visible:border-metalique focus-visible:ring-3 focus-visible:ring-metalique/12 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
