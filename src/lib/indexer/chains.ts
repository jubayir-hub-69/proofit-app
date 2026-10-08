import { arbitrum, base, polygon, type Chain } from "viem/chains"

export interface SyncChain {
  id: number
  name: string
  covalentName: string
  alchemyHost: string
  nativeSymbol: string
  chain: Chain
}

export const SYNC_CHAINS: readonly SyncChain[] = [
  {
    id: base.id,
    name: "Base",
    covalentName: "base-mainnet",
    alchemyHost: "base-mainnet",
    nativeSymbol: "ETH",
    chain: base,
  },
  {
    id: arbitrum.id,
    name: "Arbitrum",
    covalentName: "arbitrum-mainnet",
    alchemyHost: "arb-mainnet",
    nativeSymbol: "ETH",
    chain: arbitrum,
  },
  {
    id: polygon.id,
    name: "Polygon",
    covalentName: "polygon-mainnet",
    alchemyHost: "polygon-mainnet",
    nativeSymbol: "POL",
    chain: polygon,
  },
]

const byId = new Map(SYNC_CHAINS.map((chain) => [chain.id, chain]))

export function syncChain(chainId: number) {
  return byId.get(chainId)
}

export function assertSyncChains(chainIds: readonly number[]) {
  const unknown = chainIds.filter((chainId) => !byId.has(chainId))
  if (unknown.length > 0) {
    const supported = SYNC_CHAINS.map((chain) => chain.id).join(", ")
    throw new Error(
      `Unsupported chain id ${unknown.join(", ")}. Sync supports ${supported}.`,
    )
  }
  return chainIds.map((chainId) => byId.get(chainId)!)
}
