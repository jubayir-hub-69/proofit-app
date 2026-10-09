import type { FeedItem } from "@/lib/feed/types"
import { formatChain, formatUsd } from "@/lib/formatters"
import { LEGAL_DISCLAIMER } from "@/lib/legal"

function httpUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

function clip(value: string, max: number) {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function itemBlock(item: FeedItem) {
  const lines = [
    clip(item.title, 160),
    `Deadline: ${item.deadline}`,
    `Chain: ${item.chainId === null ? "not set" : formatChain(item.chainId)}`,
    `Capital: ${item.capitalUsd === null ? "not set" : formatUsd(item.capitalUsd)}`,
    `Regions: ${item.regions.length === 0 ? "unrestricted" : item.regions.join(", ")}`,
  ]
  if (item.campaignId) lines.push(`Campaign: ${item.campaignId}`)
  if (item.summary) lines.push(clip(item.summary, 240))
  const link = httpUrl(item.url)
  if (link) lines.push(link)
  return lines.join("\n")
}

/** Plain-text reminder built only from stored feed rows. */
export function deadlineMessage(
  items: readonly FeedItem[],
  scopedToWallet: boolean,
  note?: string | null,
) {
  if (items.length === 0) {
    const lead = scopedToWallet
      ? "No upcoming deadlines for your tagged campaigns."
      : "No upcoming deadlines are stored in the feed."
    const detail = note?.trim() ? `\n${note.trim()}` : ""
    return `${lead}${detail}\n\n${LEGAL_DISCLAIMER}`
  }

  const parts = ["Proofit deadline reminder", ""]
  let used = 0
  for (const item of items) {
    const candidate = [...parts, itemBlock(item), "", LEGAL_DISCLAIMER].join("\n")
    if (candidate.length > 3900) break
    parts.push(itemBlock(item), "")
    used += 1
  }
  const omitted = items.length - used
  if (omitted > 0) {
    parts.push(`${omitted} more stored deadlines were omitted from this message.`, "")
  }
  parts.push(LEGAL_DISCLAIMER)
  return parts.join("\n").slice(0, 4096)
}

export async function sendTelegramMessage(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.")
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean
    description?: string
  } | null
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description || `Telegram request failed (${response.status}).`)
  }
}
