"use client"

import { useMemo } from "react"
import { summarizeLedger, type LedgerSummary } from "@/lib/ledger"
import type { LedgerTransaction } from "@/types/transaction"

export function useLedger(
  transactions: readonly LedgerTransaction[],
): LedgerSummary {
  return useMemo(() => summarizeLedger(transactions), [transactions])
}
