const COVALENT_BASE = "https://api.covalenthq.com/v1"
const GOPLUS_BASE = "https://api.gopluslabs.io/api/v1"

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new ApiError(`Request failed (${response.status})`, response.status)
  }
  return (await response.json()) as T
}

/** GoldRush balances URL. Authenticate with `covalentHeaders()`. */
export function covalentBalancesUrl(chainName: string, walletAddress: string) {
  return `${COVALENT_BASE}/${encodeURIComponent(chainName)}/address/${encodeURIComponent(walletAddress)}/balances_v2/`
}

export function covalentHeaders(): HeadersInit {
  const key = process.env.NEXT_PUBLIC_COVALENT_API_KEY?.trim()
  return {
    Accept: "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  }
}

/**
 * GoPlus token security URL. Server routes attach the access token.
 * The token is never placed on the query string.
 */
export function goplusTokenSecurityUrl(chainId: number, contractAddress: string) {
  const url = new URL(`${GOPLUS_BASE}/token_security/${chainId}`)
  url.searchParams.set("contract_addresses", contractAddress)
  return url.toString()
}

/** GoPlus phishing-site check. Server routes attach the access token. */
export function goplusPhishingSiteUrl(target: string) {
  const url = new URL(`${GOPLUS_BASE}/phishing_site`)
  url.searchParams.set("url", target)
  return url.toString()
}

/** Public GoPlus headers. Access tokens are attached in server-only `goplusAuthHeaders`. */
export function goplusHeaders(): HeadersInit {
  return { Accept: "application/json" }
}

export interface GoPlusTokenSecurityResponse {
  code: number
  message: string
  result: Record<string, Record<string, string> | undefined>
}
