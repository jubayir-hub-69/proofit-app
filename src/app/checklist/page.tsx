import type { Metadata } from "next"
import { ChecklistView } from "@/app/checklist/checklist-view"

export const metadata: Metadata = {
  title: "Checklist",
}

export default function ChecklistPage() {
  return <ChecklistView />
}
