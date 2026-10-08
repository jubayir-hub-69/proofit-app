"use client"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { useLedgerBook } from "@/hooks/use-ledger-book"
import { useSyncStatus } from "@/hooks/use-wallet-sync"
import { useWatchAddress } from "@/hooks/use-watch-address"
import { checklistForWallet } from "@/lib/book"
import { formatUsd } from "@/lib/formatters"
import type { CampaignStatus } from "@/types/campaign"

const EMPTY_PROMPT =
  "Enter an EVM wallet address above to calculate real Net-ROI and gas history."

const statusTone: Record<
  CampaignStatus,
  "positive" | "warning" | "neutral" | "danger"
> = {
  active: "positive",
  upcoming: "warning",
  ended: "neutral",
  claimed: "neutral",
}

export function CampaignsView() {
  const { address } = useWatchAddress()
  const status = useSyncStatus()
  const ready =
    Boolean(address) && status.settled && status.address === address && !status.error
  const book = useLedgerBook(address, ready)
  const waiting = Boolean(address) && !status.error && (!ready || book.isLoading)
  const data = book.data
  const tasks = address && data ? checklistForWallet(data.checklist, address) : []

  return (
    <div>
      <PageHeader
        eyebrow="Campaigns"
        title="Today Feed"
        description={
          data
            ? `${data.summary.activeCampaignCount} indexed campaigns are active. Outstanding estimate is ${formatUsd(data.summary.unclaimedUsd)}.`
            : "Campaign totals follow the watched wallet's indexed transactions."
        }
      />

      {!address ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-zinc-900/40 px-5 py-10 text-sm leading-6 text-zinc-300">
          {EMPTY_PROMPT}
        </div>
      ) : null}
      {address && status.error ? (
        <p className="text-sm text-rose-300">{status.error}</p>
      ) : null}
      {waiting ? (
        <p className="text-sm text-zinc-400">Indexing on-chain transactions...</p>
      ) : null}

      {data && !waiting ? (
        <ul className="space-y-3">
          {data.catalog.map((campaign) => {
            const stats = data.campaigns.find((item) => item.campaignId === campaign.id)
            const related = tasks.filter((item) => item.campaign_id === campaign.id)
            const done = related.filter((item) => item.is_completed).length
            const progress =
              related.length === 0 ? 0 : Math.round((done / related.length) * 100)
            return (
              <li
                key={campaign.id}
                className="rounded-xl border border-white/10 bg-zinc-900/70 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-medium text-zinc-50">{campaign.name}</h2>
                      <Badge tone={statusTone[campaign.status]}>{campaign.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {campaign.category}
                      {campaign.description ? ` · ${campaign.description}` : ""}
                    </p>
                  </div>
                  <p className="font-mono text-sm text-zinc-100 tabular-nums">
                    {formatUsd(stats?.netUsd ?? 0, { signed: true })}
                  </p>
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs text-zinc-500">
                    <span>
                      {done}/{related.length} tasks · {stats?.transactionCount ?? 0} txs
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-emerald-400/80"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
