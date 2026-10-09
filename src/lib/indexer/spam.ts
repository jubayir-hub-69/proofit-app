import { goplusTokenSecurityUrl, fetchJson } from "@/lib/api"
import { goplusAuthHeaders } from "@/lib/goplus-auth"
import { getEvmChain } from "@/lib/chains"
import { lookupCurrentPrices } from "@/lib/defillama"
import { rawRecord } from "@/lib/book"
import type { Json, TransactionRow } from "@/types/database"

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"

export const SPAM_REASONS = ["zero_liquidity", "unverified", "phishing"] as const
export type SpamReason = (typeof SPAM_REASONS)[number]

export interface TokenVerdict {
  chainId: number
  address: string
  spam: boolean
  reasons: SpamReason[]
  usdPrice: number | null
  verified: boolean | null
  phishing: boolean | null
  symbol: string | null
}

interface LogLike {
  address: string
  topics: readonly (string | null | undefined)[]
}

function tokenKey(chainId: number, address: string) {
  return `${chainId}:${address.toLowerCase()}`
}

/** ERC-20 contracts touched by Transfer or Approval logs. No token list. */
export function erc20TokenAddresses(logs: readonly LogLike[]) {
  const tokens = new Set<string>()
  for (const log of logs) {
    const topic = log.topics[0]?.toLowerCase()
    const erc20 =
      (topic === TRANSFER_TOPIC || topic === APPROVAL_TOPIC) && log.topics.length === 3
    if (!erc20 || !log.address.startsWith("0x")) continue
    tokens.add(log.address.toLowerCase())
  }
  return [...tokens]
}

function chunks(values: readonly string[], size: number) {
  const groups: string[][] = []
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size))
  }
  return groups
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

async function sourcifyVerified(chainId: number, address: string) {
  try {
    const response = await fetch(
      `https://sourcify.dev/server/v2/contract/${chainId}/${address}`,
      { cache: "no-store", signal: AbortSignal.timeout(8_000) },
    )
    if (response.status === 404) return false
    if (!response.ok) return null
    const body = (await response.json()) as { match?: unknown }
    if (typeof body.match !== "string" || body.match.length === 0) return false
    if (body.match === "no_match" || body.match === "false") return false
    return true
  } catch {
    return null
  }
}

async function goplusByChain(chainId: number, addresses: readonly string[]) {
  const found = new Map<string, Record<string, unknown>>()
  await mapPool(chunks(addresses, 20), 3, async (group) => {
    try {
      const body = await fetchJson<{
        code?: number | string
        result?: Record<string, unknown>
      }>(goplusTokenSecurityUrl(chainId, group.join(",")), {
        headers: await goplusAuthHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      })
      if (Number(body.code) !== 1 || !body.result) return
      for (const [key, value] of Object.entries(body.result)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          found.set(key.toLowerCase(), value as Record<string, unknown>)
        }
      }
    } catch {
      // Missing metadata is unknown, not a phishing verdict.
    }
  })
  return found
}

function flag(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return value === "1" || value === 1 || value === true
}

function phishingFrom(record: Record<string, unknown> | null) {
  if (!record) return null
  if (
    flag(record, "is_honeypot") ||
    flag(record, "is_airdrop_scam") ||
    flag(record, "honeypot_with_same_creator")
  ) {
    return true
  }
  const fake = record.fake_token
  if (fake === "1" || (fake && typeof fake === "object")) return true
  const note = `${record.other_potential_risks ?? ""} ${record.note ?? ""}`.toLowerCase()
  if (note.includes("phish")) return true
  if (
    "is_honeypot" in record ||
    "is_airdrop_scam" in record ||
    "trust_list" in record
  ) {
    return false
  }
  return null
}

function verifiedFrom(
  sourcify: boolean | null,
  goplus: Record<string, unknown> | null,
) {
  if (goplus && (flag(goplus, "trust_list") || flag(goplus, "is_open_source"))) {
    return true
  }
  if (sourcify === true) return true
  if (sourcify === false) return false
  if (goplus && "is_open_source" in goplus && !flag(goplus, "is_open_source")) {
    return false
  }
  return null
}

export async function assessTokens(
  tokens: readonly { chainId: number; address: string }[],
) {
  const unique = new Map<string, { chainId: number; address: string }>()
  for (const token of tokens) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(token.address)) continue
    const address = token.address.toLowerCase()
    unique.set(tokenKey(token.chainId, address), { chainId: token.chainId, address })
  }
  const list = [...unique.values()]
  const coinByKey = new Map<string, string>()
  for (const token of list) {
    const chain = getEvmChain(token.chainId)
    if (!chain?.defillamaChain) continue
    coinByKey.set(
      tokenKey(token.chainId, token.address),
      `${chain.defillamaChain}:${token.address}`,
    )
  }

  const lookup = await lookupCurrentPrices([...coinByKey.values()])
  const byChain = new Map<number, string[]>()
  for (const token of list) {
    const group = byChain.get(token.chainId) ?? []
    group.push(token.address)
    byChain.set(token.chainId, group)
  }

  const security = new Map<string, Record<string, unknown>>()
  await Promise.all(
    [...byChain.entries()].map(async ([chainId, addresses]) => {
      const rows = await goplusByChain(chainId, addresses)
      for (const [address, record] of rows) {
        security.set(tokenKey(chainId, address), record)
      }
    }),
  )

  const sourcify = new Map<string, boolean | null>()
  await mapPool(list, 6, async (token) => {
    sourcify.set(
      tokenKey(token.chainId, token.address),
      await sourcifyVerified(token.chainId, token.address),
    )
  })

  const verdicts = new Map<string, TokenVerdict>()
  for (const token of list) {
    const key = tokenKey(token.chainId, token.address)
    const coinId = coinByKey.get(key)?.toLowerCase()
    const goplus = security.get(key) ?? null
    const reasons: SpamReason[] = []
    let usdPrice: number | null = null
    let symbol: string | null = null
    if (coinId && lookup.answered.has(coinId)) {
      const quote = lookup.prices.get(coinId)
      if (!quote || quote.price <= 0) reasons.push("zero_liquidity")
      else {
        usdPrice = quote.price
        symbol = quote.symbol
      }
    }
    const verified = verifiedFrom(sourcify.get(key) ?? null, goplus)
    const phishing = phishingFrom(goplus)
    if (verified === false) reasons.push("unverified")
    if (phishing === true) reasons.push("phishing")
    verdicts.set(key, {
      chainId: token.chainId,
      address: token.address,
      spam: reasons.length > 0,
      reasons,
      usdPrice,
      verified,
      phishing,
      symbol,
    })
  }
  return verdicts
}

function asAddresses(value: Json | undefined) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function verdictJson(verdict: TokenVerdict): { [key: string]: Json } {
  return {
    address: verdict.address,
    spam: verdict.spam,
    reasons: [...verdict.reasons],
    usdPrice: verdict.usdPrice,
    verified: verdict.verified,
    phishing: verdict.phishing,
    symbol: verdict.symbol,
  }
}

/** Flag a transaction only when every detected ERC-20 on it is spam or dust. */
export async function applySpamFlags(rows: readonly TransactionRow[]) {
  const refs: { chainId: number; address: string }[] = []
  for (const row of rows) {
    const raw = rawRecord(row.raw_data)
    for (const address of asAddresses(raw?.tokenAddresses)) {
      refs.push({ chainId: row.chain_id, address })
    }
  }
  const verdicts = refs.length > 0 ? await assessTokens(refs) : new Map<string, TokenVerdict>()

  return rows.map((row) => {
    const raw = rawRecord(row.raw_data) ?? {}
    const addresses = asAddresses(raw.tokenAddresses)
    const tokens = addresses.flatMap((address) => {
      const verdict = verdicts.get(tokenKey(row.chain_id, address))
      return verdict ? [verdict] : []
    })
    const spam = tokens.length > 0 && tokens.every((token) => token.spam)
    const reasons = [...new Set(tokens.flatMap((token) => token.reasons))]
    return {
      ...row,
      raw_data: {
        ...raw,
        spam,
        spamReasons: spam ? reasons : [],
        tokens: tokens.map(verdictJson),
      },
    }
  })
}
