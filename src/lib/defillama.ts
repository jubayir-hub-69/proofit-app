import { fetchJson } from "@/lib/api"

/** Coin id used by DefiLlama's historical ETH endpoint. */
export const ETH_PRICE_ID = "coingecko:ethereum"

const HISTORICAL_TTL_MS = 6 * 60 * 60 * 1000
const SPOT_TTL_MS = 60_000
const MISS_TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  price: number | null
  expires: number
}

interface LlamaCoin {
  price?: number
  symbol?: string
}

interface LlamaResponse {
  coins?: Record<string, LlamaCoin>
}

const cache = new Map<string, CacheEntry>()

export function historicalEthPriceUrl(unixSeconds: number) {
  return `https://coins.llama.fi/prices/historical/${unixSeconds}/coingecko:ethereum`
}

export function unixSeconds(iso: string) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return Math.floor(ms / 1000)
}

function historicalPriceUrl(coinId: string, timestamp: number) {
  if (coinId === ETH_PRICE_ID) return historicalEthPriceUrl(timestamp)
  return `https://coins.llama.fi/prices/historical/${timestamp}/${coinId}`
}

function readCache(key: string) {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expires <= Date.now()) {
    cache.delete(key)
    return undefined
  }
  return entry.price
}

function writeCache(key: string, price: number | null) {
  const fresh = price !== null && key.startsWith("spot:")
  const historical = price !== null
  cache.set(key, {
    price,
    expires: Date.now() + (fresh ? SPOT_TTL_MS : historical ? HISTORICAL_TTL_MS : MISS_TTL_MS),
  })
}

function priceFrom(body: LlamaResponse, coinId: string) {
  const coins = body.coins ?? {}
  const target = coinId.toLowerCase()
  for (const [key, value] of Object.entries(coins)) {
    if (key.toLowerCase() !== target) continue
    if (typeof value.price === "number" && Number.isFinite(value.price)) {
      return value.price
    }
  }
  return null
}

async function mapPool<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
) {
  if (items.length === 0) return
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await task(items[index]!)
    }
  }
  const workers = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
}

async function fetchHistorical(coinId: string, timestamp: number) {
  const key = `hist:${coinId.toLowerCase()}:${timestamp}`
  const cached = readCache(key)
  if (cached !== undefined) return cached
  try {
    const body = await fetchJson<LlamaResponse>(historicalPriceUrl(coinId, timestamp), {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
    const price = priceFrom(body, coinId)
    writeCache(key, price)
    return price
  } catch {
    writeCache(key, null)
    return null
  }
}

export async function historicalPrices(coinId: string, timestamps: readonly number[]) {
  const result = new Map<number, number | null>()
  await mapPool([...new Set(timestamps)], 6, async (timestamp) => {
    result.set(timestamp, await fetchHistorical(coinId, timestamp))
  })
  return result
}

export interface SpotCoin {
  price: number
  symbol: string | null
}

function chunks(values: readonly string[], size: number) {
  const groups: string[][] = []
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size))
  }
  return groups
}

/** Current USD prices. `answered` lists coin ids DefiLlama responded for. */
export async function lookupCurrentPrices(coinIds: readonly string[]) {
  const unique = [...new Set(coinIds.map((id) => id.toLowerCase()))]
  const prices = new Map<string, SpotCoin>()
  const answered = new Set<string>()
  await mapPool(chunks(unique, 40), 4, async (group) => {
    const url = `https://coins.llama.fi/prices/current/${group.join(",")}`
    try {
      const body = await fetchJson<LlamaResponse>(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      })
      for (const id of group) answered.add(id)
      for (const [key, value] of Object.entries(body.coins ?? {})) {
        if (typeof value.price !== "number" || !Number.isFinite(value.price)) continue
        prices.set(key.toLowerCase(), {
          price: value.price,
          symbol: typeof value.symbol === "string" ? value.symbol : null,
        })
      }
    } catch {
      // A failed batch stays unanswered so callers do not treat a timeout as $0.
    }
  })
  return { prices, answered }
}

export async function ethSpotUsd() {
  const key = `spot:${ETH_PRICE_ID}`
  const cached = readCache(key)
  if (cached !== undefined) return cached
  const lookup = await lookupCurrentPrices([ETH_PRICE_ID])
  if (!lookup.answered.has(ETH_PRICE_ID)) return null
  const price = lookup.prices.get(ETH_PRICE_ID)?.price ?? null
  writeCache(key, price)
  return price
}
