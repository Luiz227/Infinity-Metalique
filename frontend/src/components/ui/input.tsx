import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-full border border-[#db0f0f] bg-white px-4 text-base text-neutral-900 outline-none transition-shadow placeholder:text-neutral-400 focus-visible:ring-3 focus-visible:ring-[#db0f0f]/12 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
