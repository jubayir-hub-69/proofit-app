"use client"

import { Fuel, Gift, Radio, TrendingUp } from "lucide-react"
import { MetricCard } from "@/components/dashboard/metric-card"
import { OpportunityCost } from "@/components/ledger/opportunity-cost"
import { SpamToggle } from "@/components/ledger/spam-toggle"
import { LegalDisclaimer } from "@/components/legal-disclaimer"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useFilteredLedger } from "@/hooks/use-filtered-ledger"
import { useLedgerBook } from "@/hooks/use-ledger-book"
import { useSyncStatus } from "@/hooks/use-wallet-sync"
import { useWatchAddress } from "@/hooks/use-watch-address"
import { checklistForWallet, netImpactUsd, protocolLabel } from "@/lib/book"
import { formatChain, formatTimestamp, formatUsd, shortenAddress } from "@/lib/formatters"
import { transactionKindLabel } from "@/types/transaction"

const EMPTY_PROMPT =
  "Enter an EVM wallet address above to calculate real Net-ROI and gas history."

export function DashboardOverview() {
  const { address } = useWatchAddress()
  const status = useSyncStatus()
  const ready =
    Boolean(address) && status.settled && status.address === address && !status.error
  const book = useLedgerBook(address, ready)
  const waiting =
    Boolean(address) && !status.error && (!ready || book.isLoading)

  const watchLine = address
    ? `Watching ${shortenAddress(address)}. Ledger totals stay separate from the portfolio sum above.`
    : "No watch address yet. Paste one in the top bar. Nothing is signed."

  const data = book.data
  const { hideSpam, setHideSpam, view } = useFilteredLedger(data, address)
  const summary = view?.report.summary
  const tasks =
    address && data ? checklistForWallet(data.checklist, address) : []
  const openTasks = tasks.filter((item) => !item.is_completed).length
  const recent = view?.transactions.slice(0, 5) ?? []
  const unclaimed =
    view?.report.campaigns.filter(
      (campaign) => campaign.estimatedRewardUsd > campaign.realizedValueUsd,
    ) ?? []

  return (
    <div>
      <p className="mb-5 text-sm text-zinc-400">{watchLine}</p>

      {!address ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-zinc-900/40 px-5 py-10 text-sm leading-6 text-zinc-300">
          {EMPTY_PROMPT}
        </div>
      ) : null}

      {address && status.error ? (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-5 py-4 text-sm text-rose-200">
          {status.error}
        </p>
      ) : null}

      {waiting ? (
        <div className="rounded-xl border border-white/10 bg-zinc-900/70 px-5 py-8 text-sm" aria-live="polite">
          <p className="text-zinc-100">Indexing on-chain transactions...</p>
          <p className="mt-1 text-zinc-500">Calculating gas & slippage...</p>
        </div>
      ) : null}

      {book.error ? (
        <p className="text-sm text-rose-300">{book.error.message}</p>
      ) : null}

      {data && view && summary && !waiting ? (
        <>
          <div className="mb-4">
            <SpamToggle
              checked={hideSpam}
              hiddenCount={view.hiddenCount}
              onChange={setHideSpam}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Hide Spam & Dust Tokens changes these ledger totals only. Holdings stay listed, including unpriced assets.
            </p>
          </div>
          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total Net ROI"
              value={formatUsd(summary.netRoiUsd, { signed: true })}
              detail={`${formatUsd(summary.valueUsd)} claimed · ${summary.transactionCount} indexed transactions, after gas`}
              icon={TrendingUp}
              tone={summary.netRoiUsd >= 0 ? "positive" : "negative"}
              href="/ledger"
            />
            <MetricCard
              label="Total Gas Spent"
              value={formatUsd(summary.gasSpentUsd)}
              detail={`Across ${summary.chainCount} networks`}
              icon={Fuel}
              tone="neutral"
              href="/ledger"
            />
            <MetricCard
              label="Active Campaigns"
              value={String(summary.activeCampaignCount)}
              detail={`${openTasks} open checklist tasks`}
              icon={Radio}
              tone="neutral"
              href="/campaigns"
            />
            <MetricCard
              label="Unclaimed Airdrops"
              value={formatUsd(summary.unclaimedUsd)}
              detail={
                summary.unclaimedUsd > 0
                  ? "Estimate still ahead of indexed credit"
                  : "No outstanding estimate on indexed campaigns"
              }
              icon={Gift}
              tone="warning"
              href="/campaigns"
            />
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-medium text-zinc-100">Ledger / Performance</h2>
            <div className="mt-3">
              <OpportunityCost summary={view.opportunity} />
            </div>
          </section>

          <section className="mt-6 grid gap-3 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle>Recent ledger</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {recent.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-zinc-500">
                    {hideSpam && data.transactions.length > 0
                      ? "Spam and dust transfers are hidden."
                      : "No transactions in the indexed window."}
                  </p>
                ) : (
                  <ul>
                    {recent.map((transaction) => {
                      const net = netImpactUsd(transaction)
                      return (
                        <li
                          key={transaction.id}
                          className="flex items-center justify-between gap-3 border-t border-white/5 px-5 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-zinc-100">
                              {protocolLabel(transaction, data.catalog)}
                              <span className="text-zinc-500">
                                {" "}
                                · {transactionKindLabel[transaction.type]}
                              </span>
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {formatChain(transaction.chain_id)} ·{" "}
                              {formatTimestamp(transaction.block_timestamp)}
                            </p>
                          </div>
                          <p
                            className={`font-mono text-sm tabular-nums ${
                              net >= 0 ? "text-emerald-300" : "text-rose-300"
                            }`}
                          >
                            {formatUsd(net, { signed: true })}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle>Unclaimed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {unclaimed.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No unclaimed estimate on this wallet.
                  </p>
                ) : (
                  unclaimed.map((campaign) => (
                    <div
                      key={campaign.campaignId ?? campaign.name}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-zinc-100">
                          {campaign.name}
                        </p>
                        <p className="text-xs text-zinc-500">{campaign.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm text-amber-200 tabular-nums">
                          {formatUsd(
                            campaign.estimatedRewardUsd - campaign.realizedValueUsd,
                          )}
                        </p>
                        <Badge tone="warning" className="mt-1">
                          {campaign.status}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </section>
        </>
      ) : null}
      <LegalDisclaimer />
    </div>
  )
}
