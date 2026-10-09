import { scanTarget } from "@/lib/safety/scan"
import type { SafetyScanResponse } from "@/lib/safety/types"

function invalid(error: string) {
  const body: SafetyScanResponse = {
    ok: false,
    level: null,
    label: null,
    checks: [],
    notice: null,
    error,
  }
  return Response.json(body, { status: 400 })
}

export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return invalid("Expected a JSON body.")
  }
  const record =
    payload && typeof payload === "object" ? (payload as { target?: unknown; chainId?: unknown }) : {}
  const target = typeof record.target === "string" ? record.target.trim() : ""
  const chainId = typeof record.chainId === "number" ? record.chainId : Number(record.chainId)
  if (!target) return invalid("Enter a contract address or a claim URL.")
  if (!Number.isInteger(chainId)) return invalid("Choose a chain from the registry.")
  const result = await scanTarget(target, chainId)
  return Response.json(result)
}
