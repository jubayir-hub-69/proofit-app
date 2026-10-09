import { rawRecord } from "@/lib/book"
import { ETH_PRICE_ID, ethSpotUsd, historicalPrices, unixSeconds } from "@/lib/defillama"
import { roundUsd } from "@/lib/indexer/gas"
import type { TransactionRow } from "@/types/database"
import type { LedgerTransaction } from "@/types/transaction"

export const OPPORTUNITY_COST_LABEL =
  "Opportunity Cost (Hold ETH Comparison) — Reference metric only, not financial advice."

export interface LedgerSummary {
  netRoiUsd: number
  gasSpentUsd: number
  valueUsd: number
  count: number
  chainIds: number[]
}

export interface SpendRecord {
  timestamp: string
  usd: number
}

export interface OpportunityPoint {
  transactionId: string
  timestamp: string
  spentUsd: number
  ethPriceUsd: number | null
  ethAmount: number | null
}

export interface OpportunityBook {
  spotEthUsd: number | null
  points: OpportunityPoint[]
}

export interface OpportunityCostSummary {
  spentUsd: number
  ethAmount: number
  currentWorthUsd: number | null
  deltaUsd: number | null
  pricedCount: number
  unpricedCount: number
  spotEthUsd: number | null
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

/** USD that left the wallet as gas or outbound capital, stamped with the block time. */
export function recordSpend(input: {
  timestamp: string
  gasSpentUsd: number
  capitalSpentUsd: number
}): SpendRecord | null {
  const usd = roundUsd(input.gasSpentUsd + Math.max(0, input.capitalSpentUsd))
  if (!(usd > 0) || input.timestamp.length === 0) return null
  return { timestamp: input.timestamp, usd }
}

export function spendPoint(row: TransactionRow): SpendRecord | null {
  const raw = rawRecord(row.raw_data)
  const spend = raw?.spend
  if (spend && typeof spend === "object" && !Array.isArray(spend)) {
    const usd = spend.usd
    const timestamp = spend.timestamp
    if (typeof usd === "number" && usd > 0 && typeof timestamp === "string") {
      return { timestamp, usd }
    }
  }
  if (row.gas_fee_usd > 0) {
    return { timestamp: row.block_timestamp, usd: row.gas_fee_usd }
  }
  return null
}

/**
 * ETH that the spent USD could have bought at the historical DefiLlama price,
 * marked to the live ETH spot.
 */
export async function buildEthOpportunity(
  rows: readonly TransactionRow[],
): Promise<OpportunityBook> {
  const drafts: {
    transactionId: string
    timestamp: string
    spentUsd: number
    unix: number
  }[] = []
  for (const row of rows) {
    const spend = spendPoint(row)
    if (!spend) continue
    const unix = unixSeconds(spend.timestamp)
    if (unix === null) continue
    drafts.push({
      transactionId: row.id,
      timestamp: spend.timestamp,
      spentUsd: roundUsd(spend.usd),
      unix,
    })
  }

  const [spot, history] = await Promise.all([
    ethSpotUsd(),
    historicalPrices(
      ETH_PRICE_ID,
      drafts.map((item) => item.unix),
    ),
  ])

  const points = drafts.map((item) => {
    const quote = history.get(item.unix) ?? null
    const priced = quote !== null && quote > 0
    return {
      transactionId: item.transactionId,
      timestamp: item.timestamp,
      spentUsd: item.spentUsd,
      ethPriceUsd: priced ? quote : null,
      ethAmount: priced ? item.spentUsd / quote : null,
    }
  })

  return {
    spotEthUsd: spot !== null && spot > 0 ? spot : null,
    points,
  }
}

export function summarizeOpportunityCost(
  points: readonly OpportunityPoint[],
  spotEthUsd: number | null,
): OpportunityCostSummary {
  let spentUsd = 0
  let ethAmount = 0
  let pricedCount = 0
  let unpricedCount = 0
  for (const point of points) {
    if (point.ethAmount === null || point.ethPriceUsd === null || !(point.ethPriceUsd > 0)) {
      unpricedCount += 1
      continue
    }
    pricedCount += 1
    spentUsd += point.spentUsd
    ethAmount += point.ethAmount
  }
  spentUsd = roundUsd(spentUsd)
  const live = spotEthUsd !== null && spotEthUsd > 0 ? spotEthUsd : null
  const currentWorthUsd =
    live !== null && pricedCount > 0 ? roundUsd(ethAmount * live) : null
  return {
    spentUsd,
    ethAmount,
    currentWorthUsd,
    deltaUsd: currentWorthUsd === null ? null : roundUsd(currentWorthUsd - spentUsd),
    pricedCount,
    unpricedCount,
    spotEthUsd: live,
  }
}
