"use client"

import { useState } from "react"
import { LegalDisclaimer } from "@/components/legal-disclaimer"
import { PageHeader } from "@/components/layout/page-header"
import { OpportunityCost } from "@/components/ledger/opportunity-cost"
import { SpamToggle } from "@/components/ledger/spam-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useFilteredLedger } from "@/hooks/use-filtered-ledger"
import { useLedgerBook, useRefreshLedger } from "@/hooks/use-ledger-book"
import { useSyncStatus } from "@/hooks/use-wallet-sync"
import { useWatchAddress } from "@/hooks/use-watch-address"
import { isSpamTransaction, isUnclassified, netImpactUsd, protocolLabel } from "@/lib/book"
import { downloadCsv, toCsv } from "@/lib/csv"
import { formatChain, formatTimestamp, formatUsd } from "@/lib/formatters"
import { DB_TRANSACTION_TYPES, type DbTransactionType, type TransactionRow } from "@/types/database"
import { transactionKindLabel } from "@/types/transaction"

const EMPTY_PROMPT =
  "Enter an EVM wallet address above to calculate real Net-ROI and gas history."

export function LedgerView() {
  const { address } = useWatchAddress()
  const status = useSyncStatus()
  const ready =
    Boolean(address) && status.settled && status.address === address && !status.error
  const book = useLedgerBook(address, ready)
  const waiting = Boolean(address) && !status.error && (!ready || book.isLoading)
  const data = book.data
  const { hideSpam, setHideSpam, view } = useFilteredLedger(data, address)
  const summary = view?.report.summary

  function exportCsv() {
    if (!data || !view || !address) return
    const header = [
      "Date/Time",
      "Chain",
      "Protocol/Tag",
      "Type",
      "Gas Spent (USD)",
      "Claimed Value (USD)",
      "Net Impact (USD)",
    ]
    const rows = view.transactions.map((transaction) => [
      formatTimestamp(transaction.block_timestamp),
      formatChain(transaction.chain_id),
      protocolLabel(transaction, data.catalog),
      transactionKindLabel[transaction.type],
      formatUsd(transaction.gas_fee_usd),
      formatUsd(transaction.value_usd),
      formatUsd(netImpactUsd(transaction), { signed: true }),
    ])
    downloadCsv(`proofit-ledger-${address.slice(2, 8).toLowerCase()}.csv`, toCsv(header, rows))
  }

  return (
    <div>
      <PageHeader
        eyebrow="Book"
        title="Net Ledger"
        description="Indexed transactions across the EVM registry. Net impact is claimed value minus gas."
        action={
          <Button
            type="button"
            variant="outline"
            disabled={!view || view.transactions.length === 0}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        }
      />

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

      {book.error ? <p className="text-sm text-rose-300">{book.error.message}</p> : null}

      {data && view && summary && address && !waiting ? (
        <>
          <div className="mb-4">
            <SpamToggle
              checked={hideSpam}
              hiddenCount={view.hiddenCount}
              onChange={setHideSpam}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Hide Spam & Dust Tokens changes these ledger totals only. It does not remove genuine holdings.
            </p>
          </div>
          {status.warnings.length > 0 || status.errors.length > 0 ? (
            <ul className="mb-4 space-y-1 text-xs text-zinc-500">
              {[...status.errors, ...status.warnings].map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          ) : null}

          <dl className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3">
              <dt className="text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
                Net ROI
              </dt>
              <dd className="mt-1 font-mono text-lg text-emerald-300 tabular-nums">
                {formatUsd(summary.netRoiUsd, { signed: true })}
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3">
              <dt className="text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
                Total Claimed
              </dt>
              <dd className="mt-1 font-mono text-lg text-zinc-50 tabular-nums">
                {formatUsd(summary.valueUsd)}
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3">
              <dt className="text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
                Total Gas
              </dt>
              <dd className="mt-1 font-mono text-lg text-zinc-50 tabular-nums">
                {formatUsd(summary.gasSpentUsd)}
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3">
              <dt className="text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
                Events
              </dt>
              <dd className="mt-1 font-mono text-lg text-zinc-50 tabular-nums">
                {summary.transactionCount}
              </dd>
            </div>
          </dl>

          <section className="mb-5">
            <h2 className="mb-3 text-sm font-medium text-zinc-100">Ledger / Performance</h2>
            <OpportunityCost summary={view.opportunity} />
          </section>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[980px] text-left text-sm">
              <caption className="sr-only">Indexed net ledger</caption>
              <thead className="bg-white/[0.03] text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Date/Time</th>
                  <th className="px-4 py-3 font-medium">Chain</th>
                  <th className="px-4 py-3 font-medium">Protocol/Tag</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 text-right font-medium">Gas Spent ($USD)</th>
                  <th className="px-4 py-3 text-right font-medium">Claimed Value ($USD)</th>
                  <th className="px-4 py-3 text-right font-medium">Net Impact</th>
                </tr>
              </thead>
              <tbody>
                {view.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-sm text-zinc-500">
                      {hideSpam && data.transactions.length > 0
                        ? "Spam and dust transfers are hidden. Uncheck the filter to see them."
                        : "No logs named this wallet in the current sync window."}
                    </td>
                  </tr>
                ) : (
                  view.transactions.map((transaction) => {
                    const net = netImpactUsd(transaction)
                    return (
                      <tr key={transaction.id} className="border-t border-white/5 align-top">
                        <td className="px-4 py-3 whitespace-nowrap text-zinc-400">
                          {formatTimestamp(transaction.block_timestamp)}
                        </td>
                        <td className="px-4 py-3 text-zinc-300">
                          {formatChain(transaction.chain_id)}
                        </td>
                        <td className="px-4 py-3 text-zinc-100">
                          {isUnclassified(transaction) ? (
                            <TagEditor
                              row={transaction}
                              address={address}
                              catalog={data.catalog}
                            />
                          ) : (
                            protocolLabel(transaction, data.catalog)
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge>{transactionKindLabel[transaction.type]}</Badge>
                            {isSpamTransaction(transaction) ? (
                              <Badge tone="warning">Spam</Badge>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-300 tabular-nums">
                          {formatUsd(transaction.gas_fee_usd)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-300 tabular-nums">
                          {formatUsd(transaction.value_usd)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono tabular-nums ${
                            net >= 0 ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          {formatUsd(net, { signed: true })}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <LegalDisclaimer />
    </div>
  )
}

function TagEditor({
  row,
  address,
  catalog,
}: {
  row: TransactionRow
  address: string
  catalog: { id: string; name: string }[]
}) {
  const refresh = useRefreshLedger()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(patch: { type?: DbTransactionType; campaign_id?: string | null }) {
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, ...patch }),
      })
      const body = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !body.ok) throw new Error(body.error || "Update failed.")
      await refresh(address)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-zinc-500">Unclassified contract</p>
      <div className="flex flex-col gap-1.5">
        <select
          aria-label="Transaction type"
          disabled={pending}
          value={row.type}
          onChange={(event) =>
            void save({ type: event.target.value as DbTransactionType })
          }
          className="h-8 rounded-lg border border-white/10 bg-zinc-950/80 px-2 text-xs text-zinc-100"
        >
          {DB_TRANSACTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {transactionKindLabel[type]}
            </option>
          ))}
        </select>
        <select
          aria-label="Campaign tag"
          disabled={pending}
          value={row.campaign_id ?? ""}
          onChange={(event) =>
            void save({ campaign_id: event.target.value || null })
          }
          className="h-8 rounded-lg border border-white/10 bg-zinc-950/80 px-2 text-xs text-zinc-100"
        >
          <option value="">Unassigned</option>
          {catalog.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  )
}
