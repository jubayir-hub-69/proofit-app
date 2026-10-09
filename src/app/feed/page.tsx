import type { Metadata } from "next"
import { FeedView } from "@/app/feed/feed-view"

export const metadata: Metadata = {
  title: "Today Feed",
}

export default function FeedPage() {
  return <FeedView telegramConfigured={Boolean(process.env.TELEGRAM_BOT_TOKEN)} />
}
