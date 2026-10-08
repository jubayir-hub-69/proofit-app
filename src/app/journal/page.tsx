import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = {
  title: "Trader Journal",
}

export default function JournalPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Notes"
        title="Trader Journal"
        description="Notes stay beside the ledger. Nothing is stored until an entry is written."
      />
      <div className="rounded-xl border border-dashed border-white/15 bg-zinc-900/40 px-5 py-10 text-sm text-zinc-400">
        No journal entries yet.
      </div>
    </div>
  )
}
