import { createHash } from "node:crypto"

interface TokenResponse {
  code?: number | string
  message?: string
  result?: { access_token?: string }
}

let cached: { token: string; expiresAt: number } | null = null

export function goplusConfigured() {
  return Boolean(process.env.GOPLUS_APP_KEY?.trim() && process.env.GOPLUS_APP_SECRET?.trim())
}

/** Server-only access token. The app key and secret are never returned. */
export async function goplusAccessToken() {
  if (typeof window !== "undefined") return null
  const appKey = process.env.GOPLUS_APP_KEY?.trim()
  const appSecret = process.env.GOPLUS_APP_SECRET?.trim()
  if (!appKey || !appSecret) return null
  if (cached && cached.expiresAt > Date.now()) return cached.token

  const time = Math.floor(Date.now() / 1000)
  const sign = createHash("sha1").update(`${appKey}${time}${appSecret}`).digest("hex")
  try {
    const response = await fetch("https://api.gopluslabs.io/api/v1/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app_key: appKey, sign, time }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) return null
    const body = (await response.json()) as TokenResponse
    const token = body.result?.access_token
    if (Number(body.code) !== 1 || typeof token !== "string" || token.length === 0) {
      return null
    }
    cached = { token, expiresAt: Date.now() + 50 * 60 * 1000 }
    return token
  } catch {
    return null
  }
}

export async function goplusAuthHeaders(): Promise<HeadersInit> {
  const token = await goplusAccessToken()
  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
