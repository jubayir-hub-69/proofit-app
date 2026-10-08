import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus-visible:border-emerald-400/40 focus-visible:ring-2 focus-visible:ring-emerald-400/30 disabled:opacity-40",
        className,
      )}
      {...props}
    />
  )
}
