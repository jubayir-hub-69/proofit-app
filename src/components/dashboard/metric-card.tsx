import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const tones = {
  positive: "text-emerald-300",
  negative: "text-rose-300",
  warning: "text-amber-200",
  neutral: "text-zinc-50",
} as const

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  href,
}: {
  label: string
  value: string
  detail: string
  icon: LucideIcon
  tone?: keyof typeof tones
  href?: string
}) {
  const card = (
    <Card
      className={cn(
        "h-full p-5",
        href && "transition-colors group-hover:border-white/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium tracking-[0.16em] text-zinc-500 uppercase">
          {label}
        </p>
        <span className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-300">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p
        className={cn(
          "mt-4 font-mono text-[1.65rem] leading-none font-medium tracking-tight tabular-nums",
          tones[tone],
        )}
      >
        {value}
      </p>
      <p className="mt-3 text-sm text-zinc-400">{detail}</p>
    </Card>
  )

  if (!href) return card

  return (
    <Link
      href={href}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
    >
      {card}
    </Link>
  )
}
