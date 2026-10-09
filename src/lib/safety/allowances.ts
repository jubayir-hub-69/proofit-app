import { alchemyHttpUrl } from "@/lib/alchemy"
import { EVM_CHAINS, publicRpcUrls, rememberPublicRpc, type EvmChain } from "@/lib/chains"
import type { AllowanceScanResponse, ApprovalRow, ChainAllowanceScan } from "@/lib/safety/types"
import {
  createPublicClient,
  erc20Abi,
  getAddress,
  http,
  parseAbiItem,
  type Address,
  type PublicClient,
} from "viem"

/** Newest blocks read per chain. Older approvals are omitted rather than invented. */
export const ALLOWANCE_LOOKBACK_BLOCKS = 50_000

const CHUNK_BLOCKS = BigInt(5_000)
const CHAIN_BUDGET_MS = 8_000
const MAX_PAIRS = 25
const APPROVAL = parseAbiItem(
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
)

interface FoundPair {
  token: Address
  spender: Address
}

function errorText(error: unknown) {
  if (!error || typeof error !== "object") return String(error)
  const record = error as {
    shortMessage?: string
    details?: string
    message?: string
    cause?: { message?: string }
  }
  return [record.shortMessage, record.details, record.cause?.message, record.message]
    .filter((part): part is string => Boolean(part))
    .join(" ")
}

function needsContractAddress(text: string) {
  const lower = text.toLowerCase()
  return lower.includes("specify an address") || lower.includes("address in your request")
}

function isRangeError(text: string) {
  const lower = text.toLowerCase()
  if (lower.includes("request limit") || lower.includes("too many") || lower.includes("rate limit")) {
    return false
  }
  return (
    lower.includes("block range") ||
    lower.includes("too large") ||
    lower.includes("ranges over") ||
    lower.includes("maximum") ||
    lower.includes("more than")
  )
}

function maxBlockSpan(text: string) {
  const named = text.match(/up to a (\d+) block range/i)
  if (named) return BigInt(named[1])
  const suggested = text.match(/\[(0x[0-9a-fA-F]+),\s*(0x[0-9a-fA-F]+)\]/)
  if (!suggested || !text.toLowerCase().includes("block range")) return null
  const from = BigInt(suggested[1])
  const to = BigInt(suggested[2])
  if (to < from) return null
  return to - from + BigInt(1)
}

function redactSecrets(text: string) {
  return text
    .replace(/\/v2\/[A-Za-z0-9_-]+/g, "/v2/[redacted]")
    .replace(/([?&](?:key|apikey|api_key|token)=)[^&\s"']+/gi, "$1[redacted]")
}

function clientError(error: unknown) {
  const text = redactSecrets(typeof error === "string" ? error : errorText(error))
  return text.length > 280 ? `${text.slice(0, 280)}…` : text
}

function rpcCandidates(chainId: number) {
  const urls: string[] = []
  const alchemy = alchemyHttpUrl(chainId)
  if (alchemy) urls.push(alchemy)
  for (const url of publicRpcUrls(chainId)) {
    if (!urls.includes(url)) urls.push(url)
  }
  return urls
}

function clientFor(chain: EvmChain, url: string) {
  return createPublicClient({
    chain: chain.chain,
    transport: http(url, { timeout: 7_000, retryCount: 0 }),
  })
}

async function queryApprovalLogs(
  client: PublicClient,
  wallet: Address,
  fromBlock: bigint,
  toBlock: bigint,
) {
  return client.getLogs({
    event: APPROVAL,
    args: { owner: wallet },
    fromBlock,
    toBlock,
  })
}

type ApprovalLog = Awaited<ReturnType<typeof queryApprovalLogs>>[number]

async function logsInRange(
  client: PublicClient,
  wallet: Address,
  fromBlock: bigint,
  toBlock: bigint,
  depth = 0,
): Promise<ApprovalLog[]> {
  try {
    return await queryApprovalLogs(client, wallet, fromBlock, toBlock)
  } catch (error) {
    const text = errorText(error)
    const span = toBlock - fromBlock
    const limit = maxBlockSpan(text)
    if (limit && span + BigInt(1) > limit) throw error
    if (span > BigInt(40) && depth < 5 && isRangeError(text) && !needsContractAddress(text)) {
      const mid = fromBlock + span / BigInt(2)
      const [older, newer] = await Promise.all([
        logsInRange(client, wallet, fromBlock, mid, depth + 1),
        logsInRange(client, wallet, mid + BigInt(1), toBlock, depth + 1),
      ])
      return [...older, ...newer]
    }
    throw error
  }
}

async function openClient(chain: EvmChain, wallet: Address, deadline: number) {
  let last = `No RPC URL for ${chain.name}.`
  for (const url of rpcCandidates(chain.id)) {
    if (Date.now() >= deadline) break
    const client = clientFor(chain, url)
    try {
      const latest = await client.getBlockNumber()
      await client.getLogs({
        event: APPROVAL,
        args: { owner: wallet },
        fromBlock: latest,
        toBlock: latest,
      })
      if (!url.includes(".g.alchemy.com/")) rememberPublicRpc(chain.id, url)
      return { client, latest, error: null as string | null }
    } catch (error) {
      last = errorText(error) || last
    }
  }
  return { client: null, latest: null, error: clientError(last) }
}

function asDecimals(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255) return value
  if (typeof value === "bigint" && value >= BigInt(0) && value <= BigInt(255)) return Number(value)
  return null
}

async function readPair(
  client: PublicClient,
  wallet: Address,
  pair: FoundPair,
  chain: EvmChain,
): Promise<ApprovalRow | null> {
  const allowance = await client.readContract({
    address: pair.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [wallet, pair.spender],
  })
  if (allowance === BigInt(0)) return null
  const [symbol, decimals] = await Promise.all([
    client
      .readContract({ address: pair.token, abi: erc20Abi, functionName: "symbol" })
      .then((value) => (typeof value === "string" && value.trim() ? value.trim() : null))
      .catch(() => null),
    client
      .readContract({ address: pair.token, abi: erc20Abi, functionName: "decimals" })
      .then((value) => asDecimals(value))
      .catch(() => null),
  ])
  return {
    chainId: chain.id,
    chain: chain.name,
    token: pair.token,
    tokenSymbol: symbol,
    spender: pair.spender,
    allowanceRaw: allowance.toString(),
    decimals,
    unlimited: allowance >= BigInt(2) ** BigInt(255),
  }
}

async function scanChain(chain: EvmChain, wallet: Address): Promise<{
  scan: ChainAllowanceScan
  approvals: ApprovalRow[]
}> {
  const deadline = Date.now() + CHAIN_BUDGET_MS
  const empty = (error: string | null, partial = false): ChainAllowanceScan => ({
    chainId: chain.id,
    chain: chain.name,
    fromBlock: null,
    toBlock: null,
    partial,
    truncated: false,
    error,
  })

  const opened = await openClient(chain, wallet, deadline)
  if (!opened.client || opened.latest === null) {
    return { scan: empty(opened.error), approvals: [] }
  }

  const lookback = BigInt(ALLOWANCE_LOOKBACK_BLOCKS)
  const floor = opened.latest > lookback ? opened.latest - lookback : BigInt(0)
  const pairs = new Map<string, FoundPair>()
  let chunk = CHUNK_BLOCKS
  let scannedFrom: bigint | null = null
  let scannedTo: bigint | null = null
  let truncated = false
  let error: string | null = null

  try {
    for (let upper = opened.latest; upper >= floor && Date.now() < deadline && pairs.size < MAX_PAIRS; ) {
      const lower = upper - chunk + BigInt(1) < floor ? floor : upper - chunk + BigInt(1)
      let logs: ApprovalLog[]
      try {
        logs = await logsInRange(opened.client, wallet, lower, upper)
      } catch (caught) {
        const limit = maxBlockSpan(errorText(caught))
        if (limit && limit > BigInt(0) && limit < chunk) {
          chunk = limit
          continue
        }
        throw caught
      }
      for (const log of logs) {
        const spender = log.args.spender
        if (!spender || !isHexAddress(log.address)) continue
        const token = getAddress(log.address)
        const key = `${token.toLowerCase()}:${spender.toLowerCase()}`
        if (!pairs.has(key)) {
          if (pairs.size >= MAX_PAIRS) {
            truncated = true
            break
          }
          pairs.set(key, { token, spender: getAddress(spender) })
        }
      }
      scannedTo ??= upper
      scannedFrom = lower
      if (pairs.size >= MAX_PAIRS) {
        truncated = true
        break
      }
      if (lower === BigInt(0)) break
      upper = lower - BigInt(1)
    }
  } catch (caught) {
    error = clientError(caught) || `Approval logs failed on ${chain.name}.`
  }

  if (scannedFrom === null && !error) {
    error = `Scan stopped at the time budget on ${chain.name}.`
  } else if (Date.now() >= deadline && scannedFrom !== null && scannedFrom > floor) {
    error ??= `Scan stopped at the time budget on ${chain.name}.`
  }

  const client = opened.client
  const approvals: ApprovalRow[] = []
  let readFailures = 0
  await mapPool([...pairs.values()], 5, async (pair) => {
    try {
      const row = await readPair(client, wallet, pair, chain)
      if (row) approvals.push(row)
    } catch {
      readFailures += 1
    }
  })
  if (readFailures > 0) {
    const note = `${readFailures} allowance read${readFailures === 1 ? "" : "s"} failed on ${chain.name}.`
    error = error ? `${error} ${note}` : note
  }

  return {
    scan: {
      chainId: chain.id,
      chain: chain.name,
      fromBlock: scannedFrom === null ? null : scannedFrom.toString(),
      toBlock: scannedTo === null ? null : scannedTo.toString(),
      partial: scannedFrom !== null && scannedFrom > floor,
      truncated,
      error,
    },
    approvals,
  }
}

function isHexAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

async function mapPool<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>) {
  if (items.length === 0) return
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await task(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
}

export async function scanAllowances(address: Address): Promise<AllowanceScanResponse> {
  const wallet = getAddress(address)
  const settled = new Array<Awaited<ReturnType<typeof scanChain>>>(EVM_CHAINS.length)
  let cursor = 0
  async function worker() {
    while (cursor < EVM_CHAINS.length) {
      const index = cursor
      cursor += 1
      const chain = EVM_CHAINS[index]!
      try {
        settled[index] = await scanChain(chain, wallet)
      } catch (error) {
        settled[index] = {
          scan: {
            chainId: chain.id,
            chain: chain.name,
            fromBlock: null,
            toBlock: null,
            partial: false,
            truncated: false,
            error: clientError(error) || `Allowance scan failed on ${chain.name}.`,
          },
          approvals: [],
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, EVM_CHAINS.length) }, () => worker()))

  const approvals = settled
    .flatMap((item) => item.approvals)
    .sort((left, right) => left.chain.localeCompare(right.chain) || left.token.localeCompare(right.token))

  return {
    ok: true,
    address: wallet,
    lookbackBlocks: ALLOWANCE_LOOKBACK_BLOCKS,
    approvals,
    chains: settled.map((item) => item.scan),
    error: null,
  }
}
