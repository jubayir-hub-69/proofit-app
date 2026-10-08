import type { LedgerTransaction } from "@/types/transaction"

export interface LedgerSummary {
  netRoiUsd: number
  gasSpentUsd: number
  valueUsd: number
  count: number
  chainIds: number[]
}

export function summarizeLedger(
  transactions: readonly LedgerTransaction[],
): LedgerSummary {
  const chainIds = new Set<number>()
  let netRoiUsd = 0
  let gasSpentUsd = 0
  let valueUsd = 0

  for (const transaction of transactions) {
    netRoiUsd += transaction.netUsd
    gasSpentUsd += transaction.gasSpentUsd
    valueUsd += transaction.valueUsd
    chainIds.add(transaction.chainId)
  }

  return {
    netRoiUsd,
    gasSpentUsd,
    valueUsd,
    count: transactions.length,
    chainIds: [...chainIds],
  }
}
