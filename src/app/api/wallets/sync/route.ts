import { IndexerError, syncWallet } from "@/lib/indexer"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { ok: false, error: "Request body must be JSON." },
      { status: 400 },
    )
  }

  try {
    const result = await syncWallet(body)
    return Response.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof IndexerError) {
      return Response.json(
        { ok: false, error: error.message },
        { status: error.status },
      )
    }
    console.error(error)
    return Response.json({ ok: false, error: "Sync failed." }, { status: 500 })
  }
}
