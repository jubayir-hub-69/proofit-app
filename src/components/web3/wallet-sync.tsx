"use client"

import { useEffect } from "react"
import { Input } from "@/components/ui/input"
import { usePortfolio } from "@/hooks/use-portfolio"
import { useWalletSync } from "@/hooks/use-wallet-sync"
import { useWatchAddress } from "@/hooks/use-watch-address"
import { formatUsd, shortenAddress } from "@/lib/formatters"

export function WalletSync() {
  const { input, setInput, address, isValid } = useWatchAddress()
  const { status, sync } = useWalletSync()
  const portfolio = usePortfolio(address)
  const trimmed = input.trim()
  const invalid = trimmed.length > 0 && !isValid
  const syncing = Boolean(address) && (status.pending || status.address !== address)
  const failed = Boolean(status.error && status.address === address)

  useEffect(() => {
    if (!address) return
    const handle = window.setTimeout(() => {
      void sync(address)
    }, 400)
    return () => window.clearTimeout(handle)
  }, [address, sync])

  let hint = "Paste a public address. Proofit never asks to sign."
  if (invalid) hint = "Enter a valid EVM address."
  else if (status.error && status.address === address) hint = status.error
  else if (address && portfolio.isLoading) {
    hint = `${shortenAddress(address)} · reading on-chain balances`
  } else if (address && portfolio.data) {
    const worth =
      portfolio.data.netWorthUsd === null ? "Unlisted / N/A" : formatUsd(portfolio.data.netWorthUsd)
    hint = `${shortenAddress(address)} · portfolio ${worth}`
  } else if (address && portfolio.isError) {
    hint = `${shortenAddress(address)} · portfolio unavailable`
  } else if (address && status.settled && status.imported !== null) {
    hint = `${shortenAddress(address)} · indexed ${status.imported} transactions`
  }

  return (
    <div className="w-full sm:w-96">
      <label
        htmlFor="wallet-sync"
        className="mb-1 flex items-center justify-between text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase"
      >
        <span>Wallet sync</span>
        <span className="tracking-normal normal-case">No custody</span>
      </label>
      <Input
        id="wallet-sync"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onBlur={() => {
          if (address) void sync(address)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && address) {
            event.preventDefault()
            void sync(address)
          }
        }}
        placeholder="0x… watch address"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        aria-invalid={invalid || failed}
        className={invalid || failed ? "border-rose-400/50" : undefined}
      />
      <div className="mt-1 min-h-4 text-xs" aria-live="polite">
        {syncing ? (
          <>
            <p className="text-zinc-300">Indexing on-chain transactions...</p>
            <p className="text-zinc-500">Calculating gas & slippage...</p>
          </>
        ) : (
          <p className={invalid || failed ? "text-rose-300" : "text-zinc-500"}>
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}
