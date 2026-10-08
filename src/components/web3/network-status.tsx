"use client"

import { useSyncExternalStore } from "react"
import { useBlockNumber } from "wagmi"
import { mainnet } from "wagmi/chains"
import { cn } from "@/lib/utils"

function subscribe() {
  return () => {}
}

/** False during SSR and hydration, true after the client snapshot applies. */
function useClientReady() {
  return useSyncExternalStore(subscribe, () => true, () => false)
}

export function NetworkStatus() {
  const ready = useClientReady()
  const block = useBlockNumber({
    chainId: mainnet.id,
    query: {
      enabled: ready,
      refetchInterval: 20_000,
    },
  })

  const status = !ready
    ? "Syncing"
    : block.isError
      ? "No RPC"
      : block.data !== undefined
        ? "Live"
        : "Syncing"

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 text-xs text-zinc-300"
      aria-label={`Ethereum network ${status}`}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "Live" && "bg-emerald-400",
          status === "No RPC" && "bg-amber-300",
          status === "Syncing" && "bg-zinc-500",
        )}
        aria-hidden
      />
      <span>Ethereum</span>
      {block.data !== undefined ? (
        <span className="hidden font-mono text-zinc-500 sm:inline">
          {block.data.toString()}
        </span>
      ) : (
        <span className="text-zinc-500">{status}</span>
      )}
    </div>
  )
}
