import { updateTransactionTag } from "@/lib/db"
import { DB_TRANSACTION_TYPES, type DbTransactionType } from "@/types/database"

function isType(value: unknown): value is DbTransactionType {
  return (
    typeof value === "string" &&
    (DB_TRANSACTION_TYPES as readonly string[]).includes(value)
  )
}

export async function PATCH(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { ok: false, error: "Request body must be JSON." },
      { status: 400 },
    )
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { ok: false, error: "Body must be an object." },
      { status: 400 },
    )
  }
  const record = body as {
    id?: unknown
    type?: unknown
    campaign_id?: unknown
  }
  if (typeof record.id !== "string" || record.id.length === 0) {
    return Response.json({ ok: false, error: "id is required." }, { status: 400 })
  }
  if (record.type !== undefined && !isType(record.type)) {
    return Response.json(
      { ok: false, error: "type must be a ledger transaction type." },
      { status: 400 },
    )
  }
  if (
    record.campaign_id !== undefined &&
    record.campaign_id !== null &&
    typeof record.campaign_id !== "string"
  ) {
    return Response.json(
      { ok: false, error: "campaign_id must be a campaign id or null." },
      { status: 400 },
    )
  }
  if (record.type === undefined && record.campaign_id === undefined) {
    return Response.json(
      { ok: false, error: "Provide a type or a campaign_id." },
      { status: 400 },
    )
  }

  try {
    const transaction = await updateTransactionTag({
      id: record.id,
      type: record.type,
      campaignId:
        record.campaign_id === undefined ? undefined : record.campaign_id,
    })
    return Response.json({ ok: true, transaction })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed."
    const status = message.startsWith("Supabase")
      ? 502
      : message === "Transaction was not found."
        ? 404
        : 400
    if (status === 502) console.error(error)
    return Response.json({ ok: false, error: message }, { status })
  }
}
