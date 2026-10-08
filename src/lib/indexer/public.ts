import {
  createPublicClient,
  getAddress,
  http,
  parseAbiItem,
  type Address,
  type PublicClient,
} from "viem"
import { PROTOCOL_RULES } from "@/lib/indexer/categorize"
import type { SyncChain } from "@/lib/indexer/chains"
import { txLimit } from "@/lib/indexer/sources"
import type { NormalizedTransaction } from "@/lib/indexer/types"
import { publicRpcUrls, rememberPublicRpc } from "@/lib/web3/config"

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
)
const APPROVAL = parseAbiItem(
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
)

/** Newest blocks scanned on each chain when no commercial indexer key is set. */
export const PUBLIC_LOOKBACK_BLOCKS = 4500
const CHUNK_BLOCKS = BigInt(900)

const TOKEN_CONTRACTS: Record<number, readonly string[]> = {
  8453: [
    "0x4200000000000000000000000000000000000006",
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  ],
  42161: [
    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    "0x912CE59144191C1204E64559FE8253a0e49E6548",
  ],
  137: [
    "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  ],
}

interface FoundTx {
  hash: `0x${string}`
  blockNumber: bigint
  from: string | null
  to: string | null
  logAddresses: string[]
  topics: string[]
}

function watchContracts(chainId: number): Address[] {
  const tokens = TOKEN_CONTRACTS[chainId] ?? []
  const protocols = PROTOCOL_RULES.flatMap((rule) => rule.addresses)
  return [...new Set([...tokens, ...protocols].map((item) => getAddress(item)))]
}

function errorText(error: unknown) {
  if (!error || typeof error !== "object") return String(error)
  const record = error as {
    shortMessage?: string
    details?: string
    message?: string
    cause?: { data?: unknown; message?: string }
  }
  const data = record.cause?.data
  const causeMessage = record.cause?.message
  return [record.shortMessage, record.details, typeof data === "string" ? data : "", causeMessage, record.message]
    .filter((part): part is string => Boolean(part))
    .join(" ")
}

function needsContractAddress(text: string) {
  const lower = text.toLowerCase()
  return (
    lower.includes("specify an address") ||
    lower.includes("address in your request")
  )
}

function isRangeError(text: string) {
  const lower = text.toLowerCase()
  if (
    lower.includes("request limit") ||
    lower.includes("too many") ||
    lower.includes("rate limit")
  ) {
    return false
  }
  return (
    lower.includes("block range") ||
    lower.includes("too large") ||
    lower.includes("ranges over") ||
    lower.includes("maximum")
  )
}

function clientFor(chain: SyncChain, url: string) {
  return createPublicClient({
    chain: chain.chain,
    transport: http(url, { timeout: 20_000, retryCount: 0 }),
  })
}

async function queryLogs(
  client: PublicClient,
  wallet: Address,
  fromBlock: bigint,
  toBlock: bigint,
  contracts: Address[] | undefined,
) {
  const scoped = contracts ? { address: contracts } : {}
  const [sent, received, approvals] = await Promise.all([
    client.getLogs({
      ...scoped,
      event: TRANSFER,
      args: { from: wallet },
      fromBlock,
      toBlock,
    }),
    client.getLogs({
      ...scoped,
      event: TRANSFER,
      args: { to: wallet },
      fromBlock,
      toBlock,
    }),
    client.getLogs({
      ...scoped,
      event: APPROVAL,
      args: { owner: wallet },
      fromBlock,
      toBlock,
    }),
  ])
  return [...sent, ...received, ...approvals]
}

type WalletLog = Awaited<ReturnType<typeof queryLogs>>[number]

async function logsInRange(
  client: PublicClient,
  wallet: Address,
  fromBlock: bigint,
  toBlock: bigint,
  contracts: Address[],
  addressed: { current: boolean },
  depth = 0,
): Promise<WalletLog[]> {
  try {
    return await queryLogs(
      client,
      wallet,
      fromBlock,
      toBlock,
      addressed.current ? contracts : undefined,
    )
  } catch (error) {
    const text = errorText(error)
    if (!addressed.current && needsContractAddress(text)) {
      addressed.current = true
      return logsInRange(client, wallet, fromBlock, toBlock, contracts, addressed, depth)
    }
    const span = toBlock - fromBlock
    if (span > BigInt(40) && depth < 6 && isRangeError(text)) {
      const mid = fromBlock + span / BigInt(2)
      const [older, newer] = await Promise.all([
        logsInRange(client, wallet, fromBlock, mid, contracts, addressed, depth + 1),
        logsInRange(client, wallet, mid + BigInt(1), toBlock, contracts, addressed, depth + 1),
      ])
      return [...older, ...newer]
    }
    throw error
  }
}

function rememberLog(found: Map<string, FoundTx>, log: Awaited<ReturnType<typeof queryLogs>>[number]) {
  if (!log.transactionHash || log.blockNumber === null) return
  const args = log.args as {
    from?: string
    to?: string
    owner?: string
    spender?: string
  }
  const key = log.transactionHash.toLowerCase()
  const current = found.get(key) ?? {
    hash: log.transactionHash,
    blockNumber: log.blockNumber,
    from: args.from ?? args.owner ?? null,
    to: args.to ?? args.spender ?? null,
    logAddresses: [],
    topics: [],
  }
  if (!current.logAddresses.some((item) => item.toLowerCase() === log.address.toLowerCase())) {
    current.logAddresses.push(log.address)
  }
  const topic = log.topics[0]
  if (topic && !current.topics.includes(topic)) current.topics.push(topic)
  if (log.blockNumber > current.blockNumber) current.blockNumber = log.blockNumber
  found.set(key, current)
}

async function scanUrl(chain: SyncChain, wallet: Address, url: string) {
  const client = clientFor(chain, url)
  const latest = await client.getBlockNumber()
  const span = BigInt(PUBLIC_LOOKBACK_BLOCKS)
  const start = latest > span ? latest - span : BigInt(0)
  const contracts = watchContracts(chain.id)
  const addressed = { current: false }
  const found = new Map<string, FoundTx>()
  const limit = txLimit()

  for (let upper = latest; upper >= start && found.size < limit; ) {
    const lower =
      upper - CHUNK_BLOCKS + BigInt(1) < start ? start : upper - CHUNK_BLOCKS + BigInt(1)
    const logs = await logsInRange(client, wallet, lower, upper, contracts, addressed)
    for (const log of logs) rememberLog(found, log)
    if (lower === BigInt(0)) break
    upper = lower - BigInt(1)
  }

  const selected = [...found.values()]
    .sort((left, right) => (left.blockNumber > right.blockNumber ? -1 : 1))
    .slice(0, limit)

  const timestamps = new Map<string, string>()
  await Promise.all(
    [...new Set(selected.map((item) => item.blockNumber.toString()))].map(async (key) => {
      const block = await client.getBlock({ blockNumber: BigInt(key) })
      timestamps.set(key, new Date(Number(block.timestamp) * 1000).toISOString())
    }),
  )

  const rows: NormalizedTransaction[] = []
  for (const item of selected) {
    const blockTimestamp = timestamps.get(item.blockNumber.toString())
    if (!blockTimestamp) continue
    rows.push({
      hash: item.hash,
      chainId: chain.id,
      from: item.from,
      to: item.to,
      blockTimestamp,
      input: null,
      logAddresses: item.logAddresses,
      topics: item.topics,
      notionalUsd: null,
      quoteRate: null,
      providerGasUsd: null,
    })
  }

  rememberPublicRpc(chain.id, url)
  return rows
}

export async function fetchPublicTransactions(
  chain: SyncChain,
  address: Address,
): Promise<NormalizedTransaction[]> {
  const urls = publicRpcUrls(chain.id)
  if (urls.length === 0) {
    throw new Error(`No public RPC is configured for ${chain.name}.`)
  }
  let lastReason = "The public node did not answer."
  for (const url of urls) {
    try {
      return await scanUrl(chain, address, url)
    } catch (error) {
      lastReason = errorText(error).replace(/https?:\/\/\S+/g, "").slice(0, 180).trim()
    }
  }
  throw new Error(
    lastReason
      ? `Public RPC history failed on ${chain.name}. ${lastReason}`
      : `Public RPC history failed on ${chain.name}.`,
  )
}
