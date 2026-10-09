import { createPublicClient, fallback, http, type PublicClient } from "viem"
import { getEvmChain, getRpcUrl, publicRpcUrls } from "@/lib/chains"

const clients = new Map<number, PublicClient>()

/** Server-only. Client bundles must not import this module. */
export function alchemyApiKey() {
  return process.env.ALCHEMY_API_KEY?.trim() || undefined
}

export function alchemyHttpUrl(chainId: number) {
  const key = alchemyApiKey()
  const host = getEvmChain(chainId)?.alchemyHost
  if (!key || !host) return undefined
  return `https://${host}.g.alchemy.com/v2/${key}`
}

function serverTransport(chainId: number) {
  const urls = [
    ...new Set(
      [alchemyHttpUrl(chainId), ...publicRpcUrls(chainId)].filter((url): url is string => Boolean(url)),
    ),
  ]
  if (urls.length === 0) return http(getRpcUrl(chainId), { timeout: 20_000, retryCount: 1 })
  if (urls.length === 1) return http(urls[0], { timeout: 20_000, retryCount: 1 })
  return fallback(urls.map((url) => http(url, { timeout: 12_000, retryCount: 0 })))
}

export function getServerRpcClient(chainId: number): PublicClient {
  const existing = clients.get(chainId)
  if (existing) return existing
  const entry = getEvmChain(chainId)
  if (!entry) throw new Error(`Unsupported chain id ${chainId}.`)
  const client = createPublicClient({
    chain: entry.chain,
    transport: serverTransport(chainId),
  })
  clients.set(chainId, client)
  return client
}

export function redactRpcSecrets(text: string) {
  return text
    .replace(/\/v2\/[A-Za-z0-9_-]+/g, "/v2/[redacted]")
    .replace(/([?&](?:key|apikey|api_key|token)=)[^&\s"']+/gi, "$1[redacted]")
}
