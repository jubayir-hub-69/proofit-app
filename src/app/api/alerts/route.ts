import { loadStore, restUpsert, supabaseConfig } from "@/lib/db"
import { isUpcomingDeadline } from "@/lib/feed/filter"
import { loadFeedItems } from "@/lib/feed/load"
import { deadlineMessage, sendTelegramMessage } from "@/lib/telegram"
import { getAddress, isAddress } from "viem"

const CHAT_ID = /^-?\d{1,20}$/

function fail(error: string, status: number) {
  return Response.json({ ok: false, sent: false, matched: 0, error }, { status })
}

export async function POST(request: Request) {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    return fail("TELEGRAM_BOT_TOKEN is not set.", 503)
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return fail("Expected a JSON body.", 400)
  }
  const record =
    payload && typeof payload === "object"
      ? (payload as { chatId?: unknown; walletAddress?: unknown })
      : {}
  const chatId = typeof record.chatId === "string" ? record.chatId.trim() : ""
  if (!CHAT_ID.test(chatId)) {
    return fail("Enter a numeric Telegram chat id.", 400)
  }

  let wallet: `0x${string}` | null = null
  if (typeof record.walletAddress === "string" && record.walletAddress.trim()) {
    if (!isAddress(record.walletAddress)) return fail("Wallet address is not a valid EVM address.", 400)
    wallet = getAddress(record.walletAddress)
  }

  const feed = await loadFeedItems()
  let campaignIds: Set<string> | null = null
  if (wallet) {
    try {
      const store = await loadStore(wallet)
      campaignIds = new Set(
        store.transactions.flatMap((row) => (row.campaign_id ? [row.campaign_id] : [])),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tagged campaigns could not be loaded."
      return fail(message, 502)
    }
  }

  const now = Date.now()
  const matched = feed.items.filter((item) => {
    if (!isUpcomingDeadline(item.deadline, now)) return false
    if (!campaignIds) return true
    return item.campaignId !== null && campaignIds.has(item.campaignId)
  })

  try {
    await sendTelegramMessage(
      chatId,
      deadlineMessage(matched, wallet !== null, matched.length === 0 ? feed.notice : null),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram request failed."
    return fail(message, 502)
  }

  let persisted = false
  let persistNotice: string | null = null
  if (!supabaseConfig()) {
    persistNotice =
      "The alert was sent. The chat id was not stored because SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
  } else {
    try {
      await restUpsert("alert_subscriptions?on_conflict=chat_id", [
        {
          id: `tg_${chatId}`,
          chat_id: chatId,
          wallet_address: wallet,
        },
      ])
      persisted = true
    } catch (error) {
      persistNotice = error instanceof Error ? error.message : "The chat id was not stored."
    }
  }

  return Response.json({
    ok: true,
    sent: true,
    matched: matched.length,
    persisted,
    notice: persistNotice,
  })
}
