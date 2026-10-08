import type { Metadata } from "next"
import { SafetyView } from "@/app/safety/safety-view"

export const metadata: Metadata = {
  title: "Safety Gate",
}

export default function SafetyPage() {
  return (
    <SafetyView
      goplusConfigured={Boolean(process.env.NEXT_PUBLIC_GOPLUS_API_KEY)}
    />
  )
}
