"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { LedgerReport } from "@/lib/ledger-report"
import type { IndexerName } from "@/lib/indexer/types"
import type {
  CampaignChecklistRow,
  CampaignRow,
  TransactionRow,
} from "@/types/database"

export interface LedgerPayload extends LedgerReport {
  ok: true
  persistence: "memory" | "supabase"
  indexer: IndexerName
  address: string | null
  catalog: CampaignRow[]
  checklist: CampaignChecklistRow[]
  transactions: TransactionRow[]
}

export function useLedgerBook(address?: `0x${string}`, enabled = true) {
  return useQuery({
    queryKey: ["ledger", address ?? ""],
    enabled: Boolean(address) && enabled,
    queryFn: async () => {
      const response = await fetch(`/api/ledger?address=${address}`, {
        cache: "no-store",
      })
      const body = (await response.json()) as LedgerPayload & {
        ok?: boolean
        error?: string
      }
      if (!response.ok || !body.ok) {
        throw new Error(body.error || "Ledger failed.")
      }
      return body
    },
  })
}

export function useRefreshLedger() {
  const queryClient = useQueryClient()
  return (address: string) =>
    queryClient.invalidateQueries({ queryKey: ["ledger", address] })
}
