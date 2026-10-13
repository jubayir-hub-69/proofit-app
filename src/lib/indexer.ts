import { getAddress, isAddress } from "viem"
import {
  ensureStore,
  markChecklistForContracts,
  persistChecklist,
  persistSeedAndWallet,
  persistTransactions,
  persistenceMode,
  rememberIndexed,
  type Persistence,
} from "@/lib/db"
import { historicalPrices, unixSeconds } from "@/lib/defillama"
import { assertSyncChains, SYNC_CHAINS, type SyncChain } from "@/lib/indexer/chains"
import { enrichTransaction } from "@/lib/indexer/enrich"
import { fetchPublicTransactions, PUBLIC_LOOKBACK_BLOCKS } from "@/lib/indexer/public"
import { applySpamFlags } from "@/lib/indexer/spam"
import {
  fetchAlchemyTransactions,
  fetchCovalentTransactions,
  selectIndexerSource,
} from "@/lib/indexer/sources"
import type { IndexerName, NormalizedTransaction } from "@/lib/indexer/types"
import type { TransactionRow, WalletRow } from "@/types/database"

export class IndexerError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "IndexerError"
    this.status = status
  }
}

export interface SyncWalletResult {
  indexer: IndexerName
  persistence: Persistence
  address: `0x${string}`
  chains: number[]
  imported: number
  wallet: WalletRow
  transactions: TransactionRow[]
  errors: { chainId: number; message: string }[]
  warnings: string[]
}

interface SyncBody {
  address?: unknown
  chains?: unknown
}

function parseSyncBody(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new IndexerError("Body must be an object with address and chains.")
  }
  const body = input as SyncBody
  if (typeof body.address !== "string" || !isAddress(body.address)) {
    throw new IndexerError("address must be a valid EVM address.")
  }
  const address = getAddress(body.address)
  let chainIds: number[]
  if (body.chains === undefined) {
    chainIds = SYNC_CHAINS.map((chain) => chain.id)
  } else if (
    !Array.isArray(body.chains) ||
    body.chains.some((chainId) => typeof chainId !== "number")
  ) {
    throw new IndexerError("chains must be an array of chain ids.")
  } else {
    chainIds = [...new Set(body.chains)]
  }
  if (chainIds.length === 0) {
    throw new IndexerError("chains must include at least one chain id.")
  }
  try {
    const chains = assertSyncChains(chainIds)
    return { address, chains }
  } catch (error) {
    throw new IndexerError(
      error instanceof Error ? error.message : "Unsupported chain.",
    )
  }
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await task(items[index]!)
    }
  }
  const workers = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

function sourceOrder(chain: SyncChain, preferred: IndexerName) {
  const attempts: IndexerName[] = []
  if (preferred === "covalent" && chain.covalentName) attempts.push("covalent")
  if (chain.alchemyHost && process.env.ALCHEMY_API_KEY?.trim()) {
    attempts.push("alchemy")
  }
  attempts.push("public")
  return [...new Set(attempts)]
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function loadChain(
  chain: SyncChain,
  address: `0x${string}`,
  preferred: IndexerName,
) {
  let last: Error | null = null
  for (const source of sourceOrder(chain, preferred)) {
    try {
      const run =
        source === "covalent"
          ? fetchCovalentTransactions(chain, address)
          : source === "alchemy"
            ? fetchAlchemyTransactions(chain, address)
            : fetchPublicTransactions(chain, address)
      return await withTimeout(run, 12_000, `History timed out on ${chain.name}.`)
    } catch (error) {
      last = error instanceof Error ? error : new Error("Chain sync failed.")
    }
  }
  throw last ?? new Error(`No indexer could read ${chain.name}.`)
}

function plainRow(
  chain: SyncChain,
  wallet: `0x${string}`,
  tx: NormalizedTransaction,
  indexerName: IndexerName,
): TransactionRow {
  return {
    id: `tx_${chain.id}_${tx.hash}`,
    wallet_address: wallet,
    tx_hash: tx.hash,
    chain_id: chain.id,
    block_timestamp: tx.blockTimestamp,
    type: "transfer",
    gas_fee_usd: 0,
    value_usd: tx.notionalUsd !== null && tx.notionalUsd > 0 ? tx.notionalUsd : 0,
    campaign_id: null,
    raw_data: {
      indexer: indexerName,
      from: tx.from,
      to: tx.to,
      direction: "unknown",
      notionalUsd: tx.notionalUsd,
    },
  }
}

async function nativeMarkets(
  chains: readonly SyncChain[],
  txs: readonly NormalizedTransaction[],
) {
  const wanted: { coinId: string; timestamp: number; key: string }[] = []
  for (const tx of txs) {
    if (tx.quoteRate !== null && tx.quoteRate > 0) continue
    const chain = chains.find((item) => item.id === tx.chainId)
    if (!chain?.nativePriceId) continue
    const timestamp = unixSeconds(tx.blockTimestamp)
    if (timestamp === null) continue
    wanted.push({
      coinId: chain.nativePriceId,
      timestamp,
      key: `${tx.chainId}:${tx.hash}:${chain.nativePriceId}`,
    })
  }
  const groups = new Map<string, number[]>()
  for (const item of wanted) {
    const stamps = groups.get(item.coinId) ?? []
    stamps.push(item.timestamp)
    groups.set(item.coinId, stamps)
  }
  const prices = new Map<string, Map<number, number | null>>()
  await Promise.all(
    [...groups.entries()].map(async ([coinId, timestamps]) => {
      prices.set(coinId, await historicalPrices(coinId, timestamps))
    }),
  )
  const byHash = new Map<string, number>()
  for (const item of wanted) {
    const price = prices.get(item.coinId)?.get(item.timestamp)
    if (price !== null && price !== undefined && price > 0) {
      byHash.set(item.key, price)
    }
  }
  return byHash
}

export async function syncWallet(input: unknown): Promise<SyncWalletResult> {
  const { address, chains } = parseSyncBody(input)
  await ensureStore()
  const indexer = selectIndexerSource()
  const warnings: string[] = []
  const errors: { chainId: number; message: string }[] = []

  if (indexer === "public") {
    warnings.push(
      `No Covalent or Alchemy key is set. History is read from each chain's public RPC over the last ${PUBLIC_LOOKBACK_BLOCKS} blocks, and gas is priced from the receipt using DefiLlama.`,
    )
  }

  const deadline = Date.now() + 40_000
  const settled = await mapPool(chains, 4, async (chain) => {
    if (Date.now() > deadline) {
      return {
        chainId: chain.id,
        rows: [] as NormalizedTransaction[],
        message: `${chain.name} was skipped because the scan time budget ended.`,
      }
    }
    try {
      const rows = await loadChain(chain, address, indexer)
      return { chainId: chain.id, rows, message: null }
    } catch (error) {
      return {
        chainId: chain.id,
        rows: [] as NormalizedTransaction[],
        message: error instanceof Error ? error.message : "Chain sync failed.",
      }
    }
  })
  const fetched: NormalizedTransaction[] = []
  for (const result of settled) {
    if (result.message) errors.push({ chainId: result.chainId, message: result.message })
    else fetched.push(...result.rows)
  }

  if (fetched.length === 0 && errors.length > 0) {
    console.error(
      "Wallet history returned no transactions.",
      errors
        .slice(0, 8)
        .map((item) => `${item.chainId}: ${item.message}`)
        .join(" | "),
    )
  }

  let markets = new Map<string, number>()
  try {
    markets = await nativeMarkets(chains, fetched)
  } catch (error) {
    console.error(error)
    warnings.push("Historical gas prices were unavailable. Transactions are still indexed.")
  }
  const enriched = await mapPool(fetched, 4, async (tx) => {
    const chain = chains.find((item) => item.id === tx.chainId)
    if (!chain) return null
    const marketNativeUsd = chain.nativePriceId
      ? markets.get(`${tx.chainId}:${tx.hash}:${chain.nativePriceId}`) ?? null
      : null
    try {
      return await enrichTransaction(chain, address, tx, indexer, marketNativeUsd)
    } catch (error) {
      console.error(error)
      return {
        priceSource: "unpriced" as const,
        row: plainRow(chain, address, tx, indexer),
      }
    }
  })
  let transactions = enriched.flatMap((item) => (item ? [item.row] : []))
  try {
    transactions = await applySpamFlags(transactions)
  } catch {
    warnings.push("Spam screening did not finish. Detected tokens stay visible.")
  }
  if (enriched.some((item) => item?.priceSource === "unpriced")) {
    warnings.push(
      "At least one gas figure is unpriced because DefiLlama had no native quote at that timestamp.",
    )
  }

  const walletDraft: WalletRow = {
    id: `wal_${address.slice(2, 14).toLowerCase()}`,
    address,
    label: null,
    tags: ["watch"],
    created_at: new Date().toISOString(),
  }
  const contracts = transactions.flatMap((row) => {
    const raw = row.raw_data
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return []
    const to = raw.to
    return typeof to === "string" ? [to] : []
  })
  rememberIndexed(walletDraft, transactions)
  const completed = markChecklistForContracts(address, contracts)
  let wallet = walletDraft
  let persistence: Persistence = persistenceMode()
  try {
    wallet = await persistSeedAndWallet(walletDraft)
    await persistTransactions(transactions)
    await persistChecklist(completed)
  } catch (error) {
    console.error(error)
    persistence = "memory"
    warnings.push("The remote store did not accept this index. Results stay available in this session.")
  }

  const reportedErrors = fetched.length === 0 ? [] : errors.slice(0, 8)
  if (fetched.length > 0 && errors.length > reportedErrors.length) {
    warnings.push(`${errors.length - reportedErrors.length} more networks did not return history.`)
  }

  return {
    indexer,
    persistence,
    address,
    chains: chains.map((chain) => chain.id),
    imported: transactions.length,
    wallet,
    transactions,
    errors: reportedErrors,
    warnings,
  }
}

export { selectIndexerSource, SYNC_CHAINS }
