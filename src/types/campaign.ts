export const CAMPAIGN_STATUSES = [
  "active",
  "upcoming",
  "ended",
  "claimed",
] as const

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const CAMPAIGN_TYPES = ["airdrop", "points", "quest", "retro"] as const

export type CampaignType = (typeof CAMPAIGN_TYPES)[number]

export interface Campaign {
  id: string
  name: string
  protocol: string
  chainId: number
  status: CampaignStatus
  type: CampaignType
  rewardEstimateUsd: number
  claimed: boolean
  /** ISO-8601 deadline, or null when the program has no published end. */
  endsAt: string | null
  tasksTotal: number
  tasksDone: number
}

export interface ChecklistItem {
  id: string
  campaignId: string
  campaignName: string
  label: string
  done: boolean
}
