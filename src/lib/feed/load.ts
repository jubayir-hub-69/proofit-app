import { restSelect, supabaseConfig } from "@/lib/db"
import type { FeedItem, FeedResponse } from "@/lib/feed/types"

interface FeedItemRow {
  id: string
  title: string
  summary: string | null
  url: string | null
  chain_id: number | null
  capital_usd: number | string | null
  regions: string[] | null
  deadline: string | null
  campaign_id: string | null
  created_at: string
}

const FEED_PATH =
  "feed_items?select=id,title,summary,url,chain_id,capital_usd,regions,deadline,campaign_id,created_at&order=created_at.desc&limit=1000"

function money(value: number | string | null) {
  if (value === null || value === "") return null
  const amount = typeof value === "number" ? value : Number(value)
  return Number.isFinite(amount) ? amount : null
}

function normalize(row: FeedItemRow): FeedItem | null {
  if (!row.id || !row.title) return null
  const regions = Array.isArray(row.regions)
    ? row.regions.filter((region): region is string => typeof region === "string" && region.trim().length > 0)
    : []
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    url: row.url,
    chainId: typeof row.chain_id === "number" ? row.chain_id : null,
    capitalUsd: money(row.capital_usd),
    regions,
    deadline: row.deadline,
    campaignId: row.campaign_id,
    createdAt: row.created_at,
  }
}

/** Stored feed rows only. An empty table or a missing schema returns no cards. */
export async function loadFeedItems(): Promise<FeedResponse> {
  if (!supabaseConfig()) {
    return {
      ok: true,
      persistence: "unconfigured",
      items: [],
      notice:
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. No opportunity rows are stored in the app.",
      error: null,
    }
  }

  try {
    const rows = await restSelect<FeedItemRow[]>(FEED_PATH)
    const items = rows.flatMap((row) => {
      const item = normalize(row)
      return item ? [item] : []
    })
    return {
      ok: true,
      persistence: "supabase",
      items,
      notice:
        items.length === 0
          ? "No feed items are stored. Add rows to public.feed_items. This desk does not ship sample opportunities."
          : items.length >= 1000
            ? "Showing the first 1000 stored items."
            : null,
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase request failed."
    return {
      ok: true,
      persistence: "supabase",
      items: [],
      notice: message,
      error: null,
    }
  }
}
