import { formatEth, formatUsd } from "@/lib/formatters"
import { OPPORTUNITY_COST_LABEL, type OpportunityCostSummary } from "@/lib/ledger"

function detail(summary: OpportunityCostSummary) {
  if (summary.pricedCount === 0 && summary.unpricedCount === 0) {
    return "No gas or capital was spent in this view."
  }
  if (summary.pricedCount === 0) {
    return "DefiLlama did not return an ETH price for these timestamps."
  }
  const bought = `${formatEth(summary.ethAmount)} could have been bought with ${formatUsd(summary.spentUsd)}.`
  if (summary.currentWorthUsd === null) {
    return `${bought} The live ETH spot price did not load.`
  }
  const missed =
    summary.unpricedCount > 0
      ? ` ${summary.unpricedCount} spends had no historical ETH price.`
      : ""
  return `${bought} That ETH is worth ${formatUsd(summary.currentWorthUsd)} at the live spot.${missed}`
}

export function OpportunityCost({ summary }: { summary: OpportunityCostSummary }) {
  return (
    <section className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3">
      <p className="text-sm text-zinc-300">{OPPORTUNITY_COST_LABEL}</p>
      <p className="mt-2 font-mono text-2xl text-zinc-50 tabular-nums">
        {summary.currentWorthUsd === null ? "—" : formatUsd(summary.currentWorthUsd)}
      </p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{detail(summary)}</p>
    </section>
  )
}
