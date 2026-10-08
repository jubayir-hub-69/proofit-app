import { getAddress, isAddress } from "viem"
import { loadStore, persistenceMode } from "@/lib/db"
import { selectIndexerSource } from "@/lib/indexer/sources"
import { buildLedgerReport } from "@/lib/ledger-report"

export async function GET(request: Request) {
  const addressParam = new URL(request.url).searchParams.get("address")
  let address: `0x${string}` | undefined
  if (addressParam) {
    if (!isAddress(addressParam)) {
      return Response.json(
        { ok: false, error: "address must be a valid EVM address." },
        { status: 400 },
      )
    }
    address = getAddress(addressParam)
  }

  try {
    const store = await loadStore(address)
    const transactions = [...store.transactions].sort((left, right) =>
      right.block_timestamp.localeCompare(left.block_timestamp),
    )
    const report = buildLedgerReport({
      transactions,
      campaigns: store.campaigns,
      checklist: store.campaign_checklist,
      address,
    })
    return Response.json({
      ok: true,
      persistence: persistenceMode(),
      indexer: selectIndexerSource(),
      address: address ?? null,
      ...report,
      catalog: store.campaigns,
      checklist: store.campaign_checklist,
      transactions,
    })
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : "Ledger failed."
    const status = message.startsWith("Supabase") ? 502 : 500
    return Response.json({ ok: false, error: message }, { status })
  }
}
