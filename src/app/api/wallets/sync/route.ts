import { IndexerError, syncWallet } from "@/lib/indexer"

export const maxDuration = 60

const EMPTY_HISTORY = {
  ok: true as const,
  imported: 0,
  transactions: [] as unknown[],
  warnings: [] as string[],
  errors: [] as { chainId: number; message: string }[],
}

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
    if (error instanceof IndexerError && error.status < 500) {
      return Response.json(
        { ok: false, error: error.message },
        { status: error.status },
      )
    }
    console.error(error)
    return Response.json(EMPTY_HISTORY)
  }
}
