import { ALLOWANCE_LOOKBACK_BLOCKS, scanAllowances } from "@/lib/safety/allowances"
import type { AllowanceScanResponse } from "@/lib/safety/types"
import { getAddress, isAddress } from "viem"

export const maxDuration = 120

function empty(error: string, status: number) {
  const body: AllowanceScanResponse = {
    ok: false,
    address: null,
    lookbackBlocks: ALLOWANCE_LOOKBACK_BLOCKS,
    approvals: [],
    chains: [],
    error,
  }
  return Response.json(body, { status })
}

export async function GET(request: Request) {
  const addressParam = new URL(request.url).searchParams.get("address")
  if (!addressParam || !isAddress(addressParam)) {
    return empty("address must be a valid EVM address.", 400)
  }
  try {
    return Response.json(await scanAllowances(getAddress(addressParam)))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Allowance scan failed."
    return empty(message, 502)
  }
}
