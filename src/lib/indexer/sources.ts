import { ApiError, covalentHeaders, fetchJson } from "@/lib/api"
import { alchemyHttpUrl } from "@/lib/alchemy"
import type { SyncChain } from "@/lib/indexer/chains"
import type { IndexerName, NormalizedTransaction } from "@/lib/indexer/types"

const COVALENT_BASE = "https://api.covalenthq.com/v1"
const TX_LIMIT = 25

export function txLimit() {
  return TX_LIMIT
}

export function selectIndexerSource(): IndexerName {
  if (process.env.NEXT_PUBLIC_COVALENT_API_KEY?.trim()) return "covalent"
  if (process.env.ALCHEMY_API_KEY?.trim()) return "alchemy"
  return "public"
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function asHash(value: unknown): `0x${string}` | null {
  const text = asString(value)
  if (!text || !text.startsWith("0x")) return null
  return text as `0x${string}`
}

function itemsFromPayload(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload)
  const data = asRecord(root?.data) ?? root
  const items = data?.items
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    const record = asRecord(item)
    return record ? [record] : []
  })
}

export async function fetchCovalentTransactions(
  chain: SyncChain,
  address: string,
): Promise<NormalizedTransaction[]> {
  if (!chain.covalentName) {
    throw new Error(`Covalent is not configured for ${chain.name}.`)
  }
  const url = `${COVALENT_BASE}/${chain.covalentName}/address/${address}/transactions_v3/?quote-currency=USD`
  let payload: unknown
  try {
    payload = await fetchJson<unknown>(url, {
      headers: covalentHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0
    throw new Error(
      status
        ? `Covalent history failed (${status}) on ${chain.name}.`
        : `Covalent history failed on ${chain.name}.`,
    )
  }

  return itemsFromPayload(payload).slice(0, TX_LIMIT).flatMap((item) => {
    const hash = asHash(item.tx_hash)
    const timestamp = asString(item.block_signed_at)
    if (!hash || !timestamp) return []
    const logs = Array.isArray(item.log_events) ? item.log_events : []
    const logAddresses: string[] = []
    const topics: string[] = []
    for (const log of logs) {
      const record = asRecord(log)
      if (!record) continue
      const sender = asString(record.sender_address)
      if (sender) logAddresses.push(sender)
      const rawTopics = record.raw_log_topics
      if (Array.isArray(rawTopics) && typeof rawTopics[0] === "string") {
        topics.push(rawTopics[0])
      }
    }
    return [
      {
        hash,
        chainId: chain.id,
        from: asString(item.from_address),
        to: asString(item.to_address),
        blockTimestamp: timestamp,
        input: null,
        logAddresses,
        topics,
        notionalUsd: asNumber(item.value_quote),
        quoteRate: asNumber(item.gas_quote_rate),
        providerGasUsd: asNumber(item.gas_quote),
      },
    ]
  })
}

interface AlchemyTransfer {
  hash?: string
  from?: string
  to?: string | null
  metadata?: { blockTimestamp?: string }
  rawContract?: { address?: string | null }
}

async function alchemyRpc<T>(chain: SyncChain, method: string, params: unknown[]) {
  const url = alchemyHttpUrl(chain.id)
  if (!url) {
    throw new Error(`Alchemy is not configured for ${chain.name}.`)
  }
  let payload: { result?: T; error?: { message?: string } }
  try {
    payload = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0
    throw new Error(
      status
        ? `Alchemy history failed (${status}) on ${chain.name}.`
        : `Alchemy history failed on ${chain.name}.`,
    )
  }
  if (payload.error) {
    throw new Error(
      payload.error.message
        ? `Alchemy history failed on ${chain.name}.`
        : `Alchemy history failed on ${chain.name}.`,
    )
  }
  return payload.result
}

async function alchemyTransfers(chain: SyncChain, address: string, field: "fromAddress" | "toAddress") {
  const result = await alchemyRpc<{ transfers?: AlchemyTransfer[] }>(
    chain,
    "alchemy_getAssetTransfers",
    [
      {
        fromBlock: "0x0",
        toBlock: "latest",
        [field]: address,
        category: ["external", "erc20", "erc721", "erc1155"],
        withMetadata: true,
        maxCount: "0x19",
        order: "desc",
      },
    ],
  )
  return result?.transfers ?? []
}

export async function fetchAlchemyTransactions(
  chain: SyncChain,
  address: string,
): Promise<NormalizedTransaction[]> {
  const [outgoing, incoming] = await Promise.all([
    alchemyTransfers(chain, address, "fromAddress"),
    alchemyTransfers(chain, address, "toAddress"),
  ])
  const grouped = new Map<string, NormalizedTransaction>()

  for (const transfer of [...outgoing, ...incoming]) {
    const hash = asHash(transfer.hash)
    const timestamp = asString(transfer.metadata?.blockTimestamp)
    if (!hash || !timestamp) continue
    const existing = grouped.get(hash)
    const logAddress = asString(transfer.rawContract?.address)
    if (existing) {
      if (logAddress) existing.logAddresses.push(logAddress)
      continue
    }
    grouped.set(hash, {
      hash,
      chainId: chain.id,
      from: asString(transfer.from),
      to: asString(transfer.to),
      blockTimestamp: timestamp,
      input: null,
      logAddresses: logAddress ? [logAddress] : [],
      topics: [],
      notionalUsd: null,
      quoteRate: null,
      providerGasUsd: null,
    })
  }

  return [...grouped.values()].slice(0, TX_LIMIT)
}
