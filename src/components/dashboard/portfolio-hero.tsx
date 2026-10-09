"use client"

import { Badge } from "@/components/ui/badge"
import { usePortfolio } from "@/hooks/use-portfolio"
import { useWatchAddress } from "@/hooks/use-watch-address"
import { formatUsd, shortenAddress } from "@/lib/formatters"
import type { PortfolioHolding, PortfolioResponse } from "@/lib/portfolio/types"

function formatPrice(value: number) {
  if (value === 0) return formatUsd(0)
  if (Math.abs(value) >= 0.01) return formatUsd(value)
  const text = value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")
  return `$${text}`
}

function priceCell(holding: PortfolioHolding) {
  if (holding.priceUsd === null) return "Unlisted / N/A"
  return formatPrice(holding.priceUsd)
}

function valueCell(holding: PortfolioHolding) {
  if (holding.valueUsd === null) return "Unlisted / N/A"
  return formatPrice(holding.valueUsd)
}

function netWorthText(data: PortfolioResponse) {
  if (data.netWorthStatus === "empty") return formatUsd(0)
  if (data.netWorthStatus === "unavailable") return "Unavailable"
  if (data.netWorthUsd === null) return "Unlisted / N/A"
  return formatUsd(data.netWorthUsd)
}

function assetLabel(holding: PortfolioHolding) {
  return holding.symbol ?? holding.name ?? (holding.contract ? shortenAddress(holding.contract) : "Native")
}

export function PortfolioHero() {
  const { address } = useWatchAddress()
  const portfolio = usePortfolio(address)
  const data = portfolio.data
  const activeChains = data?.chains.filter((chain) => chain.holdingCount > 0) ?? []
  const chainErrors = data?.chains.filter((chain) => chain.error) ?? []

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-zinc-900/80 px-5 py-5">
      <p className="text-[11px] font-medium tracking-[0.16em] text-zinc-500 uppercase">
        Total Portfolio Net Worth
      </p>
      {!address ? (
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          Enter an EVM wallet address above. Balances are read on-chain. Nothing is signed.
        </p>
      ) : portfolio.isLoading ? (
        <p className="mt-3 text-sm text-zinc-300" aria-live="polite">
          Reading on-chain balances for {shortenAddress(address)}…
        </p>
      ) : portfolio.error ? (
        <p className="mt-3 text-sm text-rose-300">{portfolio.error.message}</p>
      ) : data ? (
        <>
          <p className="mt-2 font-mono text-4xl tracking-tight text-zinc-50 tabular-nums">
            {netWorthText(data)}
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            {data.netWorthStatus === "partial"
              ? "Priced holdings only. Unpriced assets are excluded from this sum."
              : data.netWorthStatus === "unlisted"
                ? "Held assets have no DefiLlama price."
                : data.netWorthStatus === "unavailable"
                  ? "The balance scan did not complete."
                  : data.netWorthStatus === "empty"
                    ? "No non-zero balance on Ethereum, BSC, Arbitrum, Base, or Polygon."
                    : "Sum of held assets with a live DefiLlama price."}
          </p>
          {activeChains.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {activeChains.map((chain) => (
                <Badge key={chain.chainId} tone="positive">
                  {chain.network}
                </Badge>
              ))}
            </div>
          ) : null}
          {data.notice ? <p className="mt-3 text-xs leading-5 text-zinc-500">{data.notice}</p> : null}
          {chainErrors.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-amber-200/90">
              {chainErrors.map((chain) => (
                <li key={chain.chainId}>
                  {chain.network}: {chain.error}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">On-chain holdings</caption>
              <thead className="text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
                <tr>
                  <th className="px-2 py-2 font-medium">Asset</th>
                  <th className="px-2 py-2 font-medium">Network</th>
                  <th className="px-2 py-2 text-right font-medium">On-chain Balance</th>
                  <th className="px-2 py-2 text-right font-medium">Current Price</th>
                  <th className="px-2 py-2 text-right font-medium">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-sm text-zinc-500">
                      No non-zero balances returned.
                    </td>
                  </tr>
                ) : (
                  data.holdings.map((holding) => (
                    <tr
                      key={`${holding.chainId}:${holding.contract ?? "native"}`}
                      className="border-t border-white/5"
                    >
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-zinc-100">{assetLabel(holding)}</span>
                          {holding.priceUsd === null ? <Badge tone="warning">Unlisted</Badge> : null}
                        </div>
                        {holding.contract ? (
                          <p className="mt-0.5 font-mono text-xs text-zinc-500">
                            {shortenAddress(holding.contract)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-3 text-zinc-300">{holding.network}</td>
                      <td className="px-2 py-3 text-right font-mono text-zinc-100 tabular-nums">
                        {holding.balance ?? holding.balanceRaw}
                      </td>
                      <td className="px-2 py-3 text-right font-mono text-zinc-300 tabular-nums">
                        {priceCell(holding)}
                      </td>
                      <td className="px-2 py-3 text-right font-mono text-zinc-100 tabular-nums">
                        {valueCell(holding)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}
