import type { CapitalBand, FeedItem } from "@/lib/feed/types"

export function matchesChain(item: FeedItem, chainId: string) {
  if (chainId === "all") return true
  return item.chainId !== null && String(item.chainId) === chainId
}

/** $0 Free/Testnet, under $50 Low, over $100 Mid. Other amounts match All only. */
export function matchesCapital(item: FeedItem, band: CapitalBand) {
  if (band === "all") return true
  if (item.capitalUsd === null) return false
  if (band === "free") return item.capitalUsd === 0
  if (band === "low") return item.capitalUsd > 0 && item.capitalUsd < 50
  return item.capitalUsd > 100
}

/**
 * Empty regions mean no restriction was stored, so the item matches every region.
 * A typed region must match a stored region, ignoring case.
 */
export function matchesRegion(item: FeedItem, region: string) {
  const wanted = region.trim().toLowerCase()
  if (!wanted) return true
  if (item.regions.length === 0) return true
  return item.regions.some((entry) => entry.trim().toLowerCase() === wanted)
}

export function filterFeedItems(
  items: readonly FeedItem[],
  filters: { chainId: string; capital: CapitalBand; region: string },
) {
  return items.filter(
    (item) =>
      matchesChain(item, filters.chainId) &&
      matchesCapital(item, filters.capital) &&
      matchesRegion(item, filters.region),
  )
}

export function isUpcomingDeadline(deadline: string | null, nowMs: number) {
  if (!deadline) return false
  const time = Date.parse(deadline)
  return Number.isFinite(time) && time > nowMs
}

export function capitalBandOf(capitalUsd: number | null): Exclude<CapitalBand, "all"> | "other" | "unknown" {
  if (capitalUsd === null) return "unknown"
  if (capitalUsd === 0) return "free"
  if (capitalUsd > 0 && capitalUsd < 50) return "low"
  if (capitalUsd > 100) return "mid"
  return "other"
}
