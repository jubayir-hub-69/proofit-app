import { createConfig, http } from "wagmi"
import { arbitrum, base, mainnet, optimism, polygon } from "wagmi/chains"

export const supportedChains = [mainnet, arbitrum, optimism, base, polygon] as const

const ALCHEMY_HOST: Record<number, string> = {
  [mainnet.id]: "eth-mainnet",
  [arbitrum.id]: "arb-mainnet",
  [optimism.id]: "opt-mainnet",
  [base.id]: "base-mainnet",
  [polygon.id]: "polygon-mainnet",
}

/** Alchemy URL when a key is set. Undefined means the public RPC list is used. */
export function alchemyHttpUrl(chainId: number) {
  const key = process.env.NEXT_PUBLIC_ALCHEMY_KEY?.trim()
  const host = ALCHEMY_HOST[chainId]
  if (!key || !host) return undefined
  return `https://${host}.g.alchemy.com/v2/${key}`
}

/**
 * Public endpoints used when Alchemy is not configured.
 * The first URL is the chain's own public RPC. Later URLs cover rate limits.
 */
const PUBLIC_RPCS: Record<number, readonly string[]> = {
  [mainnet.id]: ["https://ethereum.publicnode.com"],
  [optimism.id]: ["https://mainnet.optimism.io"],
  [base.id]: [
    "https://mainnet.base.org",
    "https://base.gateway.tenderly.co",
    "https://base.publicnode.com",
  ],
  [arbitrum.id]: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum.publicnode.com",
  ],
  [polygon.id]: [
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon.drpc.org",
  ],
}

const preferredPublicRpc = new Map<number, string>()

export function publicRpcUrls(chainId: number) {
  return PUBLIC_RPCS[chainId] ?? []
}

/** Remember which public endpoint answered, so receipts use the same node. */
export function rememberPublicRpc(chainId: number, url: string) {
  preferredPublicRpc.set(chainId, url)
}

export function rpcHttpUrl(chainId: number) {
  return (
    alchemyHttpUrl(chainId) ??
    preferredPublicRpc.get(chainId) ??
    publicRpcUrls(chainId)[0]
  )
}

export const wagmiConfig = createConfig({
  chains: supportedChains,
  transports: {
    [mainnet.id]: http(rpcHttpUrl(mainnet.id)),
    [arbitrum.id]: http(rpcHttpUrl(arbitrum.id)),
    [optimism.id]: http(rpcHttpUrl(optimism.id)),
    [base.id]: http(rpcHttpUrl(base.id)),
    [polygon.id]: http(rpcHttpUrl(polygon.id)),
  },
  // Read-only desk. No injected wallets, no persisted connection.
  multiInjectedProviderDiscovery: false,
  storage: null,
  ssr: true,
})
