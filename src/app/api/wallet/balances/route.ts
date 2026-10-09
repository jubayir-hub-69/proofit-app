import { redactRpcSecrets } from "@/lib/alchemy"
import { loadPortfolio } from "@/lib/portfolio/load"
import { getAddress, isAddress } from "viem"

export const maxDuration = 60

export async function GET(request: Request) {
  const addressParam = new URL(request.url).searchParams.get("address")
  if (!addressParam || !isAddress(addressParam)) {
    return Response.json(
      { ok: false, error: "address must be a valid EVM address." },
      { status: 400 },
    )
  }

  try {
    return Response.json(await loadPortfolio(getAddress(addressParam)))
  } catch (error) {
    const message = redactRpcSecrets(error instanceof Error ? error.message : "Balance scan failed.")
    return Response.json(
      { ok: false, error: message.length > 280 ? `${message.slice(0, 280)}…` : message },
      { status: 502 },
    )
  }
}
