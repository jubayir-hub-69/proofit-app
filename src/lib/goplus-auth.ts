import { createHash } from "node:crypto"

interface TokenResponse {
  code?: number | string
  message?: string
  result?: { access_token?: string; expires_in?: number }
}

interface GoPlusEnvelope {
  code?: number | string
  message?: string
}

let cached: { token: string; expiresAt: number } | null = null

const AUTH_CODES = new Set([4010, 4012, 4023])

export function goplusConfigured() {
  return Boolean(process.env.GOPLUS_APP_KEY?.trim() && process.env.GOPLUS_APP_SECRET?.trim())
}

/** SHA1(app_key + unix seconds + app_secret), per the GoPlus access-token spec. */
function goplusSign(appKey: string, time: number | string, appSecret: string) {
  return createHash("sha1").update(`${appKey}${time}${appSecret}`).digest("hex")
}

function tokenTtlMs(expiresIn: number | undefined) {
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 90) {
    return (expiresIn - 60) * 1000
  }
  return 50 * 60 * 1000
}

type TokenIssue = { token: string; ttlMs: number; code: number } | { token: null; code: number }

async function requestAccessToken(
  appKey: string,
  appSecret: string,
  time: number | string,
): Promise<TokenIssue> {
  const sign = goplusSign(appKey, time, appSecret)
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
    if (!response.ok) return { token: null, code: response.status }
    const body = (await response.json()) as TokenResponse
    const token = body.result?.access_token
    const code = Number(body.code)
    if (code !== 1 || typeof token !== "string" || token.length === 0) {
      return { token: null, code: Number.isFinite(code) ? code : 0 }
    }
    return { token, code, ttlMs: tokenTtlMs(body.result?.expires_in) }
  } catch {
    return { token: null, code: 0 }
  }
}

/** Server-only access token. The app key and secret are never returned. */
export async function goplusAccessToken() {
  if (typeof window !== "undefined") return null
  const appKey = process.env.GOPLUS_APP_KEY?.trim()
  const appSecret = process.env.GOPLUS_APP_SECRET?.trim()
  if (!appKey || !appSecret) return null
  if (cached && cached.expiresAt > Date.now()) return cached.token

  const time = Math.floor(Date.now() / 1000)
  let issued = await requestAccessToken(appKey, appSecret, time)
  // The OpenAPI schema types `time` as an integer. The official SDK sends a string.
  // A wrong-signature response is retried once with the other JSON type.
  if (!issued.token && (issued.code === 4012 || issued.code === 0)) {
    issued = await requestAccessToken(appKey, appSecret, String(time))
  }
  if (!issued.token) return null
  cached = { token: issued.token, expiresAt: Date.now() + issued.ttlMs }
  return issued.token
}

function authRejected(body: GoPlusEnvelope | null) {
  if (!body) return true
  const code = Number(body.code)
  if (AUTH_CODES.has(code) || code === 401 || code === 403) return true
  const message = `${body.message ?? ""}`.toLowerCase()
  return (
    message.includes("signature") ||
    message.includes("access token") ||
    message.includes("app_key") ||
    message.includes("app key") ||
    message.includes("unauthorized")
  )
}

/**
 * Authenticated GoPlus GET.
 * The official SDK sets `Authorization` to the raw access token. Some gateways
 * expect `Bearer <token>` instead. Both are tried before the public endpoint.
 */
async function readGoPlus<T extends GoPlusEnvelope>(url: string, headers: HeadersInit): Promise<T> {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  let body: T | null = null
  try {
    body = (await response.json()) as T
  } catch {
    body = null
  }
  if (body && (body.code !== undefined || body.message !== undefined)) return body
  if (!response.ok) {
    return { code: response.status, message: `GoPlus request failed (${response.status}).` } as T
  }
  return (body ?? { code: 0, message: "GoPlus returned an empty body." }) as T
}

export async function goplusFetch<T extends GoPlusEnvelope>(url: string) {
  const configured = goplusConfigured()
  const token = await goplusAccessToken()
  const send = (headers: HeadersInit) => readGoPlus<T>(url, headers)

  if (!token) {
    return { body: await send({ Accept: "application/json" }), usedPublic: configured }
  }

  const raw = await send({ Accept: "application/json", Authorization: token })
  if (!authRejected(raw)) return { body: raw, usedPublic: false }

  const bearer = await send({
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  })
  if (!authRejected(bearer)) return { body: bearer, usedPublic: false }

  return {
    body: await send({ Accept: "application/json" }),
    usedPublic: true,
  }
}
