import { alchemyHttpUrl, getServerRpcClient, redactRpcSecrets } from "@/lib/alchemy"
import { getEvmChain } from "@/lib/chains"
import { lookupCurrentPrices } from "@/lib/defillama"
import { formatTokenAmount } from "@/lib/formatters"
import {
  PORTFOLIO_CHAIN_IDS,
  type NetWorthStatus,
  type PortfolioChain,
  type PortfolioHolding,
  type PortfolioResponse,
} from "@/lib/portfolio/types"
import { erc20Abi, getAddress, isAddress, type Address, type PublicClient } from "viem"

const PAGE_CAP = 5
const MULTICALL_SIZE = 80

interface AlchemyTokenRow {
  contractAddress?: string
  tokenBalance?: string | null
  error?: string | null
}

interface AlchemyTokenPage {
  tokenBalances?: AlchemyTokenRow[]
  pageKey?: string
}

interface AlchemyMetadata {
  name?: string | null
  symbol?: string | null
  decimals?: number | null
}

interface DiscoveredToken {
  contract: Address
  alchemyRaw: bigint
}

function safeError(error: unknown, fallback: string) {
  const text = redactRpcSecrets(error instanceof Error ? error.message : fallback)
  return text.length > 280 ? `${text.slice(0, 280)}…` : text
}

async function alchemyRpc<T>(chainId: number, method: string, params: unknown[]): Promise<T> {
  const url = alchemyHttpUrl(chainId)
  if (!url) {
    throw new Error("ALCHEMY_API_KEY is not set, so ERC-20 balances were not scanned.")
  }
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
  } catch (error) {
    throw new Error(safeError(error, "Alchemy request failed."))
  }
  if (!response.ok) {
    const detail = redactRpcSecrets(await response.text())
    if (response.status === 403 || /not enabled/i.test(detail)) {
      throw new Error("Alchemy is not enabled for this network, so ERC-20 balances were not scanned.")
    }
    throw new Error(`Alchemy request failed (${response.status}).`)
  }
  const body = (await response.json()) as { result?: T; error?: { message?: string } }
  if (body.error) {
    throw new Error(safeError(body.error.message || "Alchemy returned an error.", "Alchemy returned an error."))
  }
  if (body.result === undefined) {
    throw new Error("Alchemy returned no result.")
  }
  return body.result
}

function parseBalance(hex: string | null | undefined) {
  if (!hex || !hex.startsWith("0x")) return null
  try {
    return BigInt(hex)
  } catch {
    return null
  }
}

function cleanText(value: string | null | undefined) {
  if (!value) return null
  const text = value.replace(/\s+/g, " ").trim()
  if (!text) return null
  return text.length > 64 ? text.slice(0, 64) : text
}

function decimalsOf(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isInteger(value)) return null
  if (value < 0 || value > 36) return null
  return value
}

/** USD value of a raw balance. Null when the amount cannot be priced exactly. */
export function holdingUsd(raw: bigint, decimals: number, price: number) {
  if (!Number.isFinite(price) || price < 0) return null
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null
  const negative = raw < BigInt(0)
  const abs = negative ? -raw : raw
  let base = BigInt(1)
  for (let index = 0; index < decimals; index += 1) base *= BigInt(10)
  const whole = abs / base
  if (whole > BigInt(Number.MAX_SAFE_INTEGER)) return null
  const fraction = abs % base
  const scale = BigInt(1_000_000_000_000)
  const scaled = (fraction * scale) / base
  const amount = Number(whole) + Number(scaled) / 1e12
  const usd = amount * price
  if (!Number.isFinite(amount) || !Number.isFinite(usd)) return null
  return negative ? -usd : usd
}

async function discoverTokens(chainId: number, owner: Address) {
  const found: DiscoveredToken[] = []
  let pageKey: string | undefined
  let truncated = false
  for (let page = 0; page < PAGE_CAP; page += 1) {
    const options: { maxCount: number; pageKey?: string } = { maxCount: 100 }
    if (pageKey) options.pageKey = pageKey
    const result = await alchemyRpc<AlchemyTokenPage>(chainId, "alchemy_getTokenBalances", [
      owner,
      "erc20",
      options,
    ])
    for (const row of result.tokenBalances ?? []) {
      if (row.error) continue
      const raw = parseBalance(row.tokenBalance)
      if (raw === null || raw === BigInt(0)) continue
      if (!row.contractAddress || !isAddress(row.contractAddress)) continue
      found.push({ contract: getAddress(row.contractAddress), alchemyRaw: raw })
    }
    if (!result.pageKey) {
      truncated = false
      break
    }
    pageKey = result.pageKey
    truncated = page === PAGE_CAP - 1
  }
  return { found, truncated }
}

async function liveBalances(client: PublicClient, owner: Address, tokens: readonly Address[]) {
  const balances = new Map<string, bigint>()
  for (let index = 0; index < tokens.length; index += MULTICALL_SIZE) {
    const slice = tokens.slice(index, index + MULTICALL_SIZE)
    const results = await client.multicall({
      allowFailure: true,
      contracts: slice.map((address) => ({
        address,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [owner] as const,
      })),
    })
    results.forEach((result, resultIndex) => {
      const contract = slice[resultIndex]
      if (!contract || result.status !== "success" || typeof result.result !== "bigint") return
      balances.set(contract.toLowerCase(), result.result)
    })
  }
  return balances
}

async function tokenMetadata(chainId: number, contract: Address) {
  try {
    const result = await alchemyRpc<AlchemyMetadata>(chainId, "alchemy_getTokenMetadata", [contract])
    return {
      symbol: cleanText(result.symbol),
      name: cleanText(result.name),
      decimals: decimalsOf(result.decimals),
    }
  } catch {
    return { symbol: null, name: null, decimals: null }
  }
}

async function mapPool<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>) {
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
  if (workers === 0) return results
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

async function scanChain(chainId: number, owner: Address): Promise<{
  chain: PortfolioChain
  holdings: PortfolioHolding[]
  notice: string | null
}> {
  const entry = getEvmChain(chainId)
  const network = entry?.name ?? `Chain ${chainId}`
  if (!entry) {
    return {
      chain: { chainId, network, ok: false, holdingCount: 0, error: "Chain is not registered." },
      holdings: [],
      notice: null,
    }
  }

  const holdings: PortfolioHolding[] = []
  const notes: string[] = []
  let nativeOk = false
  let tokenOk = false
  let nativeError: string | null = null
  let tokenError: string | null = null
  let client: PublicClient
  try {
    client = getServerRpcClient(chainId)
  } catch (error) {
    return {
      chain: {
        chainId,
        network,
        ok: false,
        holdingCount: 0,
        error: safeError(error, "RPC client failed."),
      },
      holdings: [],
      notice: null,
    }
  }

  try {
    const nativeRaw = await client.getBalance({ address: owner })
    nativeOk = true
    if (nativeRaw > BigInt(0)) {
      holdings.push({
        chainId,
        network,
        contract: null,
        symbol: entry.nativeSymbol,
        name: entry.nativeSymbol,
        decimals: entry.chain.nativeCurrency.decimals,
        balanceRaw: nativeRaw.toString(),
        balance: formatTokenAmount(nativeRaw, entry.chain.nativeCurrency.decimals),
        priceUsd: null,
        valueUsd: null,
        priceStatus: "unavailable",
      })
    }
  } catch (error) {
    nativeError = safeError(error, "Native balance failed.")
  }

  try {
    const discovered = await discoverTokens(chainId, owner)
    if (discovered.truncated) {
      notes.push(`${network} ERC-20 scan stopped after ${PAGE_CAP * 100} contracts.`)
    }
    const contracts = discovered.found.map((token) => token.contract)
    let onchain = new Map<string, bigint>()
    if (contracts.length > 0) {
      try {
        onchain = await liveBalances(client, owner, contracts)
      } catch (error) {
        notes.push(
          `${network} multicall failed (${safeError(error, "multicall failed")}). Alchemy balances were kept.`,
        )
      }
    }
    const metadata = await mapPool(discovered.found, 6, (token) =>
      tokenMetadata(chainId, token.contract),
    )
    const missingDecimals = discovered.found.filter((_, index) => metadata[index]?.decimals === null)
    if (missingDecimals.length > 0) {
      try {
        const reads = await client.multicall({
          allowFailure: true,
          contracts: missingDecimals.map((token) => ({
            address: token.contract,
            abi: erc20Abi,
            functionName: "decimals" as const,
          })),
        })
        reads.forEach((result, index) => {
          const token = missingDecimals[index]
          if (!token || result.status !== "success" || typeof result.result !== "number") return
          const slot = metadata[discovered.found.indexOf(token)]
          if (!slot) return
          slot.decimals = decimalsOf(result.result)
        })
      } catch {
        // Missing decimals stay null so the value is Unlisted / N/A instead of a guess.
      }
    }
    discovered.found.forEach((token, index) => {
      const live = onchain.get(token.contract.toLowerCase())
      const raw = live ?? token.alchemyRaw
      if (raw === BigInt(0)) return
      const meta = metadata[index] ?? { symbol: null, name: null, decimals: null }
      holdings.push({
        chainId,
        network,
        contract: token.contract,
        symbol: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        balanceRaw: raw.toString(),
        balance: meta.decimals === null ? null : formatTokenAmount(raw, meta.decimals),
        priceUsd: null,
        valueUsd: null,
        priceStatus: "unavailable",
      })
    })
    tokenOk = true
  } catch (error) {
    tokenError = safeError(error, "ERC-20 scan failed.")
  }

  const errors = [nativeError, tokenError].filter((item): item is string => Boolean(item))
  if (!nativeOk && !tokenOk) {
    return {
      chain: {
        chainId,
        network,
        ok: false,
        holdingCount: 0,
        error: errors.join(" ") || "Balance scan failed.",
      },
      holdings: [],
      notice: null,
    }
  }

  return {
    chain: {
      chainId,
      network,
      ok: nativeOk || tokenOk,
      holdingCount: holdings.length,
      error: errors.length > 0 ? errors.join(" ") : null,
    },
    holdings,
    notice: notes.length > 0 ? notes.join(" ") : null,
  }
}

function coinId(chainId: number, contract: string | null) {
  const entry = getEvmChain(chainId)
  if (!entry?.defillamaChain) return null
  if (!contract) return entry.nativePriceId
  return `${entry.defillamaChain}:${contract.toLowerCase()}`
}

function applyPrices(
  holdings: PortfolioHolding[],
  prices: Map<string, { price: number }>,
  answered: Set<string>,
) {
  for (const holding of holdings) {
    const id = coinId(holding.chainId, holding.contract)
    if (!id) {
      holding.priceUsd = null
      holding.valueUsd = null
      holding.priceStatus = "unlisted"
      continue
    }
    const key = id.toLowerCase()
    if (!answered.has(key)) {
      holding.priceUsd = null
      holding.valueUsd = null
      holding.priceStatus = "unavailable"
      continue
    }
    const price = prices.get(key)?.price
    if (price === undefined) {
      holding.priceUsd = null
      holding.valueUsd = null
      holding.priceStatus = "unlisted"
      continue
    }
    holding.priceUsd = price
    holding.priceStatus = "priced"
    holding.valueUsd =
      holding.decimals === null
        ? null
        : holdingUsd(BigInt(holding.balanceRaw), holding.decimals, price)
  }
}

function netWorth(holdings: PortfolioHolding[], chains: PortfolioChain[]) {
  const scanned = chains.some((chain) => chain.ok)
  if (!scanned) {
    return { netWorthUsd: null as number | null, status: "unavailable" as NetWorthStatus, priced: 0, unpriced: holdings.length }
  }
  if (holdings.length === 0) {
    return { netWorthUsd: 0, status: "empty" as NetWorthStatus, priced: 0, unpriced: 0 }
  }
  let sum = 0
  let priced = 0
  let unpriced = 0
  for (const holding of holdings) {
    if (holding.priceStatus === "priced" && holding.valueUsd !== null) {
      sum += holding.valueUsd
      priced += 1
    } else {
      unpriced += 1
    }
  }
  if (priced === 0) {
    return { netWorthUsd: null, status: "unlisted" as NetWorthStatus, priced, unpriced }
  }
  const status: NetWorthStatus = unpriced === 0 ? "complete" : "partial"
  return { netWorthUsd: sum, status, priced, unpriced }
}

function sortHoldings(holdings: PortfolioHolding[]) {
  const order = new Map<number, number>(PORTFOLIO_CHAIN_IDS.map((id, index) => [id, index]))
  return [...holdings].sort((left, right) => {
    const chainDiff = (order.get(left.chainId) ?? 99) - (order.get(right.chainId) ?? 99)
    if (chainDiff !== 0) return chainDiff
    if (left.contract === null && right.contract !== null) return -1
    if (left.contract !== null && right.contract === null) return 1
    if (left.valueUsd === null && right.valueUsd === null) return 0
    if (left.valueUsd === null) return 1
    if (right.valueUsd === null) return -1
    return right.valueUsd - left.valueUsd
  })
}

export async function loadPortfolio(address: Address): Promise<PortfolioResponse> {
  const scans = await Promise.all(
    PORTFOLIO_CHAIN_IDS.map(async (chainId) => {
      try {
        return await scanChain(chainId, address)
      } catch (error) {
        const entry = getEvmChain(chainId)
        return {
          chain: {
            chainId,
            network: entry?.name ?? `Chain ${chainId}`,
            ok: false,
            holdingCount: 0,
            error: safeError(error, "Balance scan failed."),
          } satisfies PortfolioChain,
          holdings: [] as PortfolioHolding[],
          notice: null as string | null,
        }
      }
    }),
  )

  const holdings = scans.flatMap((scan) => scan.holdings)
  const ids = [
    ...new Set(
      holdings
        .map((holding) => coinId(holding.chainId, holding.contract))
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const lookup = ids.length > 0 ? await lookupCurrentPrices(ids) : { prices: new Map(), answered: new Set<string>() }
  applyPrices(holdings, lookup.prices, lookup.answered)

  const chains = scans.map((scan) => ({
    ...scan.chain,
    holdingCount: scan.holdings.length,
  }))
  const worth = netWorth(holdings, chains)
  const notes = scans.map((scan) => scan.notice).filter((note): note is string => Boolean(note))
  if (worth.status === "partial") {
    notes.push("Unpriced assets are excluded from this sum.")
  }
  if (worth.status === "unlisted") {
    notes.push("No held asset has a DefiLlama price, so the portfolio total is Unlisted / N/A.")
  }
  if (holdings.some((holding) => holding.priceStatus === "unavailable")) {
    notes.push("DefiLlama did not answer a price for some assets. Those values are Unlisted / N/A.")
  }

  return {
    ok: true,
    address,
    chains,
    holdings: sortHoldings(holdings),
    netWorthUsd: worth.netWorthUsd,
    pricedCount: worth.priced,
    unpricedCount: worth.unpriced,
    netWorthStatus: worth.status,
    notice: notes.length > 0 ? notes.join(" ") : null,
  }
}

