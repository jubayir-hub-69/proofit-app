"use client"

import { PageHeader } from "@/components/layout/page-header"
import { useLedgerBook } from "@/hooks/use-ledger-book"
import { useSyncStatus } from "@/hooks/use-wallet-sync"
import { useWatchAddress } from "@/hooks/use-watch-address"
import { checklistForWallet } from "@/lib/book"
import { cn } from "@/lib/utils"

const EMPTY_PROMPT =
  "Enter an EVM wallet address above to calculate real Net-ROI and gas history."

export function ChecklistView() {
  const { address } = useWatchAddress()
  const status = useSyncStatus()
  const ready =
    Boolean(address) && status.settled && status.address === address && !status.error
  const book = useLedgerBook(address, ready)
  const waiting = Boolean(address) && !status.error && (!ready || book.isLoading)
  const items =
    address && book.data ? checklistForWallet(book.data.checklist, address) : []
  const done = items.filter((item) => item.is_completed).length

  return (
    <div>
      <PageHeader
        eyebrow="Tasks"
        title="Checklist"
        description={
          book.data
            ? `${done} of ${items.length} campaign contracts are completed by indexed transactions.`
            : "Checklist rows complete when a synced transaction calls the campaign contract."
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

      {book.data && !waiting ? (
        <ul className="overflow-hidden rounded-xl border border-white/10">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-sm text-zinc-500">No checklist rows yet.</li>
          ) : (
            items.map((item) => {
              const campaign = book.data?.catalog.find(
                (entry) => entry.id === item.campaign_id,
              )
              return (
                <li key={item.id} className="border-t border-white/5 first:border-t-0">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                        item.is_completed
                          ? "border-emerald-400 bg-emerald-400 text-zinc-950"
                          : "border-white/20",
                      )}
                      aria-hidden
                    >
                      {item.is_completed ? (
                        <svg viewBox="0 0 12 12" className="size-3" fill="none">
                          <path
                            d="M2.5 6.2 4.7 8.4 9.5 3.6"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span>
                      <span
                        className={cn(
                          "block text-sm",
                          item.is_completed
                            ? "text-zinc-500 line-through"
                            : "text-zinc-100",
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        {campaign?.name ?? item.campaign_id}
                      </span>
                    </span>
                  </div>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
}
