import { ApiError, fetchJson } from "@/lib/api"
import { economicValueUsd } from "@/lib/indexer/categorize"
import { roundUsd } from "@/lib/indexer/gas"
import type {
  CampaignChecklistRow,
  CampaignRow,
  DbTransactionType,
  Json,
  TransactionRow,
  WalletRow,
} from "@/types/database"

export type Persistence = "supabase" | "memory"

export interface ProofStore {
  wallets: WalletRow[]
  campaigns: CampaignRow[]
  transactions: TransactionRow[]
  campaign_checklist: CampaignChecklistRow[]
}

export const SEED_CAMPAIGNS: CampaignRow[] = [
  {
    id: "cmp_uniswap",
    name: "Uniswap",
    slug: "uniswap",
    description: "Swaps routed through Uniswap Universal Router or SwapRouter02.",
    category: "swap",
    status: "active",
    estimated_reward_usd: 0,
  },
  {
    id: "cmp_across",
    name: "Across",
    slug: "across",
    description: "Bridge deposits sent to an Across SpokePool.",
    category: "bridge",
    status: "active",
    estimated_reward_usd: 0,
  },
  {
    id: "cmp_lifi",
    name: "LI.FI",
    slug: "lifi",
    description: "Jumper and LI.FI swap-and-bridge flow.",
    category: "bridge",
    status: "active",
    estimated_reward_usd: 0,
  },
  {
    id: "cmp_aave",
    name: "Aave",
    slug: "aave",
    description: "Aave V3 pool interactions on Base, Arbitrum, and Polygon.",
    category: "quest",
    status: "active",
    estimated_reward_usd: 0,
  },
]

export const SEED_CHECKLIST: CampaignChecklistRow[] = [
  {
    id: "chk_uniswap_router",
    campaign_id: "cmp_uniswap",
    title: "Swap through the Uniswap router",
    type: "contract",
    contract_address: "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
    is_completed: false,
    wallet_address: null,
  },
  {
    id: "chk_across_arb",
    campaign_id: "cmp_across",
    title: "Bridge through the Arbitrum SpokePool",
    type: "contract",
    contract_address: "0xe35e9842fceaca96570b734083f4a58e8f7c5f2a",
    is_completed: false,
    wallet_address: null,
  },
  {
    id: "chk_lifi",
    campaign_id: "cmp_lifi",
    title: "Route a hop through LI.FI",
    type: "contract",
    contract_address: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
    is_completed: false,
    wallet_address: null,
  },
]

let memory: ProofStore | null = null

function seedStore(): ProofStore {
  return {
    wallets: [],
    campaigns: SEED_CAMPAIGNS.map((campaign) => ({ ...campaign })),
    transactions: [],
    campaign_checklist: SEED_CHECKLIST.map((item) => ({ ...item })),
  }
}

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "")
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return { url, key }
}

export function persistenceMode(): Persistence {
  return supabaseConfig() ? "supabase" : "memory"
}

function memoryStore() {
  memory ??= seedStore()
  return memory
}

/** Makes sure the in-memory campaign catalog exists. Rows stay empty until a sync. */
export function ensureStore() {
  if (!supabaseConfig()) memoryStore()
  return Promise.resolve()
}

function sameAddress(left: string | null, right: string | null) {
  if (!left || !right) return false
  return left.toLowerCase() === right.toLowerCase()
}

export function upsertWallet(wallet: WalletRow) {
  const store = memoryStore()
  const index = store.wallets.findIndex((row) =>
    sameAddress(row.address, wallet.address),
  )
  if (index === -1) {
    store.wallets.push(wallet)
    return wallet
  }
  return store.wallets[index]!
}

function isManual(row: TransactionRow) {
  const raw = row.raw_data
  return Boolean(
    raw && typeof raw === "object" && !Array.isArray(raw) && raw.manual === true,
  )
}

function keepManualTag(existing: TransactionRow, incoming: TransactionRow): TransactionRow {
  if (!isManual(existing)) return { ...incoming, id: existing.id }
  return {
    ...incoming,
    id: existing.id,
    type: existing.type,
    campaign_id: existing.campaign_id,
    value_usd: existing.value_usd,
    raw_data: existing.raw_data,
  }
}

export function upsertTransactions(rows: TransactionRow[]) {
  const store = memoryStore()
  for (const row of rows) {
    const index = store.transactions.findIndex(
      (existing) =>
        sameAddress(existing.wallet_address, row.wallet_address) &&
        existing.tx_hash.toLowerCase() === row.tx_hash.toLowerCase() &&
        existing.chain_id === row.chain_id,
    )
    if (index === -1) store.transactions.push(row)
    else store.transactions[index] = keepManualTag(store.transactions[index]!, row)
  }
}

export function markChecklistForContracts(
  walletAddress: string,
  contracts: readonly string[],
) {
  const wanted = new Set(contracts.map((contract) => contract.toLowerCase()))
  const store = memoryStore()
  const templates = store.campaign_checklist.filter(
    (row) =>
      row.wallet_address === null &&
      row.contract_address &&
      wanted.has(row.contract_address.toLowerCase()),
  )
  const completed: CampaignChecklistRow[] = []

  for (const template of templates) {
    const existing = store.campaign_checklist.find(
      (row) =>
        row.campaign_id === template.campaign_id &&
        row.title === template.title &&
        sameAddress(row.wallet_address, walletAddress),
    )
    if (existing) {
      existing.is_completed = true
      completed.push({ ...existing })
      continue
    }
    const row: CampaignChecklistRow = {
      ...template,
      id: `${template.id}_${walletAddress.slice(2, 14).toLowerCase()}`,
      wallet_address: walletAddress,
      is_completed: true,
    }
    store.campaign_checklist.push(row)
    completed.push(row)
  }

  return completed
}

export function readMemory(address?: string): ProofStore {
  const store = memoryStore()
  if (!address) {
    return {
      wallets: [...store.wallets],
      campaigns: [...store.campaigns],
      transactions: [...store.transactions],
      campaign_checklist: [...store.campaign_checklist],
    }
  }
  return {
    wallets: store.wallets.filter((row) => sameAddress(row.address, address)),
    campaigns: [...store.campaigns],
    transactions: store.transactions.filter((row) =>
      sameAddress(row.wallet_address, address),
    ),
    campaign_checklist: store.campaign_checklist.filter(
      (row) => row.wallet_address === null || sameAddress(row.wallet_address, address),
    ),
  }
}

function supabaseHeaders(key: string, prefer?: string): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  }
}

async function supabaseSend(path: string, body: unknown) {
  const config = supabaseConfig()
  if (!config) throw new Error("Supabase is not configured.")
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: "POST",
    headers: supabaseHeaders(
      config.key,
      "resolution=merge-duplicates,return=minimal",
    ),
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(
      `Supabase request failed (${response.status}). Confirm supabase/schema.sql has been applied.`,
    )
  }
}

async function supabaseFetch<T>(path: string): Promise<T> {
  const config = supabaseConfig()
  if (!config) throw new Error("Supabase is not configured.")
  try {
    return await fetchJson<T>(`${config.url}/rest/v1/${path}`, {
      headers: supabaseHeaders(config.key),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0
    throw new Error(
      status
        ? `Supabase request failed (${status}). Confirm supabase/schema.sql has been applied.`
        : "Supabase request failed.",
    )
  }
}

export async function persistSeedAndWallet(wallet: WalletRow) {
  if (!supabaseConfig()) {
    for (const campaign of SEED_CAMPAIGNS) {
      const store = memoryStore()
      if (!store.campaigns.some((row) => row.id === campaign.id)) {
        store.campaigns.push({ ...campaign })
      }
    }
    return upsertWallet(wallet)
  }

  await supabaseSend("campaigns?on_conflict=id", SEED_CAMPAIGNS)
  await supabaseSend("campaign_checklist?on_conflict=id", SEED_CHECKLIST)
  const existing = await supabaseFetch<WalletRow[]>(
    `wallets?select=*&address=eq.${encodeURIComponent(wallet.address)}`,
  )
  if (existing[0]) return existing[0]
  await supabaseSend("wallets?on_conflict=address", wallet)
  return wallet
}

export async function persistTransactions(rows: TransactionRow[]) {
  if (rows.length === 0) return
  if (!supabaseConfig()) {
    upsertTransactions(rows)
    return
  }
  const quoted = rows.map((row) => `"${row.id}"`).join(",")
  const existing = await supabaseFetch<TransactionRow[]>(
    `transactions?select=*&id=in.(${quoted})`,
  )
  const previous = new Map(existing.map((row) => [row.id, row]))
  const merged = rows.map((row) => {
    const saved = previous.get(row.id)
    return saved ? keepManualTag(saved, row) : row
  })
  await supabaseSend(
    "transactions?on_conflict=wallet_address,tx_hash,chain_id",
    merged,
  )
}

export async function persistChecklist(rows: CampaignChecklistRow[]) {
  if (rows.length === 0) return
  if (!supabaseConfig()) return
  await supabaseSend("campaign_checklist?on_conflict=id", rows)
}

function rawObject(value: Json | null): { [key: string]: Json } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return { ...value }
}

function applyTag(
  row: TransactionRow,
  input: { type?: DbTransactionType; campaignId?: string | null },
  protocol: string | null | undefined,
): TransactionRow {
  const type = input.type ?? row.type
  const campaignId = input.campaignId === undefined ? row.campaign_id : input.campaignId
  const raw = rawObject(row.raw_data)
  const notional = typeof raw.notionalUsd === "number" ? raw.notionalUsd : null
  const direction =
    raw.direction === "in" || raw.direction === "out" || raw.direction === "unknown"
      ? raw.direction
      : "unknown"
  const nextProtocol =
    protocol === undefined
      ? typeof raw.protocol === "string"
        ? raw.protocol
        : null
      : protocol
  return {
    ...row,
    type,
    campaign_id: campaignId,
    value_usd: roundUsd(economicValueUsd(type, notional, direction)),
    raw_data: {
      ...raw,
      protocol: nextProtocol,
      uncategorized: false,
      manual: true,
    },
  }
}

export async function updateTransactionTag(input: {
  id: string
  type?: DbTransactionType
  campaignId?: string | null
}) {
  await ensureStore()
  const protocol = input.campaignId
    ? await campaignName(input.campaignId)
    : input.campaignId === null
      ? null
      : undefined
  if (input.campaignId && !protocol) {
    throw new Error("Unknown campaign.")
  }

  if (!supabaseConfig()) {
    const store = memoryStore()
    const index = store.transactions.findIndex((row) => row.id === input.id)
    if (index === -1) throw new Error("Transaction was not found.")
    const next = applyTag(store.transactions[index]!, input, protocol)
    store.transactions[index] = next
    return next
  }

  const current = await supabaseFetch<TransactionRow[]>(
    `transactions?select=*&id=eq.${encodeURIComponent(input.id)}`,
  )
  const row = current[0]
  if (!row) throw new Error("Transaction was not found.")
  const next = applyTag(row, input, protocol)
  const saved = await supabasePatch<TransactionRow[]>(
    `transactions?id=eq.${encodeURIComponent(input.id)}`,
    {
      type: next.type,
      campaign_id: next.campaign_id,
      value_usd: next.value_usd,
      raw_data: next.raw_data,
    },
  )
  return saved[0] ?? next
}

async function campaignName(id: string) {
  if (!supabaseConfig()) {
    return memoryStore().campaigns.find((campaign) => campaign.id === id)?.name ?? null
  }
  const rows = await supabaseFetch<CampaignRow[]>(
    `campaigns?select=*&id=eq.${encodeURIComponent(id)}`,
  )
  return rows[0]?.name ?? null
}

async function supabasePatch<T>(path: string, body: unknown): Promise<T> {
  const config = supabaseConfig()
  if (!config) throw new Error("Supabase is not configured.")
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: supabaseHeaders(config.key, "return=representation"),
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(
      `Supabase request failed (${response.status}). Confirm supabase/schema.sql has been applied.`,
    )
  }
  return (await response.json()) as T
}

export async function loadStore(address?: string): Promise<ProofStore> {
  await ensureStore()
  if (!supabaseConfig()) return readMemory(address)

  const walletFilter = address
    ? `&wallet_address=eq.${encodeURIComponent(address)}`
    : ""
  const [wallets, campaigns, transactions, checklist] = await Promise.all([
    supabaseFetch<WalletRow[]>(
      address
        ? `wallets?select=*&address=eq.${encodeURIComponent(address)}`
        : "wallets?select=*",
    ),
    supabaseFetch<CampaignRow[]>("campaigns?select=*"),
    supabaseFetch<TransactionRow[]>(`transactions?select=*${walletFilter}`),
    supabaseFetch<CampaignChecklistRow[]>(
      address
        ? `campaign_checklist?select=*&or=(wallet_address.is.null,wallet_address.eq.${encodeURIComponent(address)})`
        : "campaign_checklist?select=*",
    ),
  ])

  return {
    wallets,
    campaigns,
    transactions,
    campaign_checklist: checklist,
  }
}
