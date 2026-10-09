"use client"

import { useQuery } from "@tanstack/react-query"
import type { PortfolioResponse } from "@/lib/portfolio/types"

export function usePortfolio(address?: `0x${string}`) {
  return useQuery({
    queryKey: ["portfolio", address ?? ""],
    enabled: Boolean(address),
    queryFn: async () => {
      const response = await fetch(`/api/wallet/balances?address=${address}`, {
        cache: "no-store",
      })
      const body = (await response.json()) as PortfolioResponse & {
        ok?: boolean
        error?: string
      }
      if (!response.ok || !body.ok) {
        throw new Error(body.error || "Balance scan failed.")
      }
      return body
    },
  })
}
