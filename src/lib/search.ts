import { PROTOCOL_RULES } from "@/lib/indexer/categorize"
import { primaryNav, settingsNav } from "@/lib/navigation"

export interface SearchHit {
  id: string
  href: string
  label: string
  hint: string
}

export function buildSearchIndex(): SearchHit[] {
  const pages = [...primaryNav, settingsNav].map((item) => ({
    id: `page:${item.href}`,
    href: item.href,
    label: item.label,
    hint: "Page",
  }))

  const protocols = PROTOCOL_RULES.map((rule) => ({
    id: `protocol:${rule.campaignId}`,
    href: "/campaigns",
    label: rule.protocol,
    hint: "Protocol",
  }))

  return [...pages, ...protocols]
}

export function searchDesk(query: string, hits: readonly SearchHit[]) {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return hits
    .filter((hit) => `${hit.label} ${hit.hint}`.toLowerCase().includes(needle))
    .slice(0, 6)
}
