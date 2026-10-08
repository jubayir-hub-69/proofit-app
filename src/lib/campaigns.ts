import type { Campaign, CampaignStatus } from "@/types/campaign"

const STATUS_RANK: Record<CampaignStatus, number> = {
  active: 0,
  upcoming: 1,
  ended: 2,
  claimed: 3,
}

export interface CampaignSummary {
  active: Campaign[]
  unclaimed: Campaign[]
  activeCount: number
  unclaimedCount: number
  unclaimedUsd: number
}

export function summarizeCampaigns(
  campaigns: readonly Campaign[],
): CampaignSummary {
  const active = campaigns.filter((campaign) => campaign.status === "active")
  const unclaimed = campaigns.filter(
    (campaign) => !campaign.claimed && campaign.rewardEstimateUsd > 0,
  )
  const unclaimedUsd = unclaimed.reduce(
    (sum, campaign) => sum + campaign.rewardEstimateUsd,
    0,
  )

  return {
    active,
    unclaimed,
    activeCount: active.length,
    unclaimedCount: unclaimed.length,
    unclaimedUsd,
  }
}

export function sortCampaigns(campaigns: readonly Campaign[]) {
  return [...campaigns].sort(
    (left, right) => STATUS_RANK[left.status] - STATUS_RANK[right.status],
  )
}
