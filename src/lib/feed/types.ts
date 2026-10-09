export interface FeedItem {
  id: string
  title: string
  summary: string | null
  url: string | null
  chainId: number | null
  capitalUsd: number | null
  regions: string[]
  deadline: string | null
  campaignId: string | null
  createdAt: string
}

export type CapitalBand = "all" | "free" | "low" | "mid"

export interface FeedResponse {
  ok: boolean
  persistence: "supabase" | "unconfigured"
  items: FeedItem[]
  notice: string | null
  error: string | null
}
