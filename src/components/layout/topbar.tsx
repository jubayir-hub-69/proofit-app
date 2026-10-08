"use client"

import { Menu } from "lucide-react"
import { SearchField } from "@/components/layout/search-field"
import { Button } from "@/components/ui/button"
import { NetworkStatus } from "@/components/web3/network-status"
import { WalletSync } from "@/components/web3/wallet-sync"

export function Topbar({
  onMenu,
  onNavigate,
}: {
  onMenu: () => void
  onNavigate: () => void
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/85 px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={onMenu}
            aria-label="Open navigation"
          >
            <Menu className="size-4" aria-hidden />
          </Button>
          <span className="text-sm font-semibold tracking-tight text-zinc-50 lg:hidden">
            Proofit
          </span>
          <SearchField onNavigate={onNavigate} />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <NetworkStatus />
          <WalletSync />
        </div>
      </div>
    </header>
  )
}
