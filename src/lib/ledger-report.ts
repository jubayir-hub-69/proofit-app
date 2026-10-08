import { roundUsd } from "@/lib/indexer/gas"
import type {
  CampaignChecklistRow,
  CampaignRow,
  TransactionRow,
} from "@/types/database"

export interface CampaignBreakdown {
  campaignId: string | null
  name: string
  slug: string | null
  category: string | null
  status: string | null
  estimatedRewardUsd: number
  realizedValueUsd: number
  gasSpentUsd: number
  netUsd: number
  transactionCount: number
  checklistCompleted: number
  checklistTotal: number
}

export interface LedgerReport {
  summary: {
    netRoiUsd: number
    gasSpentUsd: number
    valueUsd: number
    transactionCount: number
    activeCampaignCount: number
    unclaimedUsd: number
    chainCount: number
  }
  campaigns: CampaignBreakdown[]
}

function checklistForCampaign(
  rows: readonly CampaignChecklistRow[],
  campaignId: string,
  address?: string,
) {
  const relevant = rows.filter((row) => {
    if (row.campaign_id !== campaignId) return false
    if (!address) return row.wallet_address !== null || row.is_completed
    if (row.wallet_address === null) {
      const clone = rows.some(
        (other) =>
          other.campaign_id === row.campaign_id &&
          other.title === row.title &&
          other.wallet_address?.toLowerCase() === address.toLowerCase(),
      )
      return !clone
    }
    return row.wallet_address.toLowerCase() === address.toLowerCase()
  })
  return {
    checklistTotal: relevant.length,
    checklistCompleted: relevant.filter((row) => row.is_completed).length,
  }
}

export function buildLedgerReport(input: {
  transactions: readonly TransactionRow[]
  campaigns: readonly CampaignRow[]
  checklist: readonly CampaignChecklistRow[]
  address?: string
}): LedgerReport {
  const gasSpentUsd = roundUsd(
    input.transactions.reduce((sum, row) => sum + row.gas_fee_usd, 0),
  )
  const valueUsd = roundUsd(
    input.transactions.reduce((sum, row) => sum + row.value_usd, 0),
  )
  const campaignsById = new Map(input.campaigns.map((campaign) => [campaign.id, campaign]))
  const groups = new Map<string, TransactionRow[]>()

  for (const transaction of input.transactions) {
    const key = transaction.campaign_id ?? "unassigned"
    const bucket = groups.get(key)
    if (bucket) bucket.push(transaction)
    else groups.set(key, [transaction])
  }

  const campaigns: CampaignBreakdown[] = [...groups.entries()]
    .map(([key, rows]) => {
      const campaign = key === "unassigned" ? null : campaignsById.get(key) ?? null
      const realizedValueUsd = roundUsd(rows.reduce((sum, row) => sum + row.value_usd, 0))
      const groupGas = roundUsd(rows.reduce((sum, row) => sum + row.gas_fee_usd, 0))
      const checklist =
        campaign === null
          ? { checklistCompleted: 0, checklistTotal: 0 }
          : checklistForCampaign(input.checklist, campaign.id, input.address)
      return {
        campaignId: campaign?.id ?? null,
        name: campaign?.name ?? "Unassigned",
        slug: campaign?.slug ?? null,
        category: campaign?.category ?? null,
        status: campaign?.status ?? null,
        estimatedRewardUsd: campaign?.estimated_reward_usd ?? 0,
        realizedValueUsd,
        gasSpentUsd: groupGas,
        netUsd: roundUsd(realizedValueUsd - groupGas),
        transactionCount: rows.length,
        ...checklist,
      }
    })
    .sort((left, right) => right.netUsd - left.netUsd)

  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "active")
  const unclaimedUsd = roundUsd(
    activeCampaigns.reduce(
      (sum, campaign) =>
        sum + Math.max(0, campaign.estimatedRewardUsd - campaign.realizedValueUsd),
      0,
    ),
  )

  return {
    summary: {
      netRoiUsd: roundUsd(valueUsd - gasSpentUsd),
      gasSpentUsd,
      valueUsd,
      transactionCount: input.transactions.length,
      activeCampaignCount: activeCampaigns.length,
      unclaimedUsd,
      chainCount: new Set(input.transactions.map((row) => row.chain_id)).size,
    },
    campaigns,
  }
}
