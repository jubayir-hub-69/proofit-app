import { loadFeedItems } from "@/lib/feed/load"

export async function GET(request: Request) {
  const url = new URL(request.url)
  void url.searchParams
  return Response.json(await loadFeedItems())
}
