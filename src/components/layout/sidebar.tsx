"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { isNavActive, primaryNav, settingsNav } from "@/lib/navigation"
import { cn } from "@/lib/utils"

export function Sidebar({
  open,
  onNavigate,
}: {
  open: boolean
  onNavigate: () => void
}) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-white/10 bg-zinc-950 transition-transform lg:static lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex items-center gap-2.5 px-4 py-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-400 text-sm font-semibold text-zinc-950">
          P
        </span>
        <div>
          <p className="text-sm font-semibold tracking-tight text-zinc-50">
            Proofit
          </p>
          <p className="text-[11px] text-zinc-500">Read-only desk</p>
        </div>
      </div>

      <nav aria-label="Primary" className="flex-1 px-3">
        <p className="px-2.5 pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Workspace
        </p>
        <ul className="space-y-1">
          {primaryNav.map((item) => {
            const active = isNavActive(pathname, item.href)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50",
                    active
                      ? "bg-white/[0.06] text-zinc-50 shadow-[inset_2px_0_0_0_#34d399]"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4",
                      active
                        ? "text-emerald-300"
                        : "text-zinc-500 group-hover:text-zinc-300",
                    )}
                    aria-hidden
                  />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          href={settingsNav.href}
          aria-current={
            isNavActive(pathname, settingsNav.href) ? "page" : undefined
          }
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50",
            isNavActive(pathname, settingsNav.href)
              ? "bg-white/[0.06] text-zinc-50"
              : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
          )}
        >
          <settingsNav.icon className="size-4" aria-hidden />
          {settingsNav.label}
        </Link>
      </div>
    </aside>
  )
}
