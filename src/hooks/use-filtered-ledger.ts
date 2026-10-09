"use client"

import { useMemo } from "react"
import { useHideSpam } from "@/hooks/use-spam-filter"
import type { LedgerPayload } from "@/hooks/use-ledger-book"
import { isSpamTransaction } from "@/lib/book"
import { buildLedgerReport } from "@/lib/ledger-report"
import { summarizeOpportunityCost } from "@/lib/ledger"

export function useFilteredLedger(
  data: LedgerPayload | undefined,
  address?: string,
) {
  const [hideSpam, setHideSpam] = useHideSpam()
  const view = useMemo(() => {
    if (!data) return null
    const transactions = hideSpam
      ? data.transactions.filter((row) => !isSpamTransaction(row))
      : data.transactions
    const report = buildLedgerReport({
      transactions,
      campaigns: data.catalog,
      checklist: data.checklist,
      address,
    })
    const visible = new Set(transactions.map((row) => row.id))
    const points = (data.opportunity?.points ?? []).filter((point) =>
      visible.has(point.transactionId),
    )
    return {
      transactions,
      report,
      opportunity: summarizeOpportunityCost(points, data.opportunity?.spotEthUsd ?? null),
      hiddenCount: data.transactions.length - transactions.length,
    }
  }, [address, data, hideSpam])
  return { hideSpam, setHideSpam, view }
}
