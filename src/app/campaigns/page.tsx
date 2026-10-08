import type { Metadata } from "next"
import { CampaignsView } from "@/app/campaigns/campaigns-view"

export const metadata: Metadata = {
  title: "Today Feed",
}

export default function CampaignsPage() {
  return <CampaignsView />
}
