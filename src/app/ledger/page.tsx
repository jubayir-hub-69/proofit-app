import type { Metadata } from "next"
import { LedgerView } from "@/app/ledger/ledger-view"

export const metadata: Metadata = {
  title: "Net Ledger",
}

export default function LedgerPage() {
  return <LedgerView />
}
