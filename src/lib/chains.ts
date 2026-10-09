import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
} from "viem"
import {
  abstract,
  apeChain,
  arbitrum,
  avalanche,
  base,
  berachain,
  blast,
  bsc,
  celo,
  fraxtal,
  gnosis,
  ink,
  linea,
  mainnet,
  manta,
  mantle,
  metis,
  mode,
  moonbeam,
  opBNB,
  optimism,
  polygon,
  polygonZkEvm,
  rootstock,
  scroll,
  sei,
  shape,
  soneium,
  sonic,
  taiko,
  unichain,
  worldchain,
  zksync,
  zora,
} from "viem/chains"

const NATIVE_PLACEHOLDER = "0x0000000000000000000000000000000000000000"

export interface EvmChain {
  id: number
  name: string
  nativeSymbol: string
  /** Alchemy subdomain, without the protocol. Null uses the public RPC. */
  alchemyHost: string | null
  /** GoldRush chain name. Null skips Covalent for this network. */
  covalentName: string | null
  /** DefiLlama coin prefix, for example `base` or `era`. */
  defillamaChain: string | null
  /** DefiLlama id for the native gas token. */
  nativePriceId: string | null
  chain: Chain
}

interface ChainExtra {
  alchemyHost?: string
  covalentName?: string
  defillamaChain?: string
}

function entry(chain: Chain, extra: ChainExtra = {}): EvmChain {
  const defillamaChain = extra.defillamaChain ?? null
  return {
    id: chain.id,
    name: chain.name,
    nativeSymbol: chain.nativeCurrency.symbol,
    alchemyHost: extra.alchemyHost ?? null,
    covalentName: extra.covalentName ?? null,
    defillamaChain,
    nativePriceId: defillamaChain
      ? `${defillamaChain}:${NATIVE_PLACEHOLDER}`
      : null,
    chain,
  }
}

/**
 * Active EVM mainnets. Append another `viem/chains` export to extend the desk.
 * Server RPC uses Alchemy when `alchemyHost` is set and `ALCHEMY_API_KEY` is present.
 * The browser bundle does not receive that key and falls back to the public RPC.
 */
export const EVM_CHAINS: readonly EvmChain[] = [
  entry(mainnet, {
    alchemyHost: "eth-mainnet",
    covalentName: "eth-mainnet",
    defillamaChain: "ethereum",
  }),
  entry(optimism, {
    alchemyHost: "opt-mainnet",
    covalentName: "optimism-mainnet",
    defillamaChain: "optimism",
  }),
  entry(bsc, {
    alchemyHost: "bnb-mainnet",
    covalentName: "bsc-mainnet",
    defillamaChain: "bsc",
  }),
  entry(gnosis, {
    alchemyHost: "gnosis-mainnet",
    defillamaChain: "gnosis",
  }),
  entry(unichain, {
    alchemyHost: "unichain-mainnet",
    defillamaChain: "unichain",
  }),
  entry(polygon, {
    alchemyHost: "polygon-mainnet",
    covalentName: "polygon-mainnet",
    defillamaChain: "polygon",
  }),
  entry(sonic, {
    alchemyHost: "sonic-mainnet",
    defillamaChain: "sonic",
  }),
  entry(manta, {
    alchemyHost: "manta-mainnet",
    defillamaChain: "manta",
  }),
  entry(opBNB, {
    alchemyHost: "opbnb-mainnet",
    defillamaChain: "op_bnb",
  }),
  entry(fraxtal, { defillamaChain: "fraxtal" }),
  entry(shape, {
    alchemyHost: "shape-mainnet",
    defillamaChain: "shape",
  }),
  entry(worldchain, {
    alchemyHost: "worldchain-mainnet",
    defillamaChain: "wc",
  }),
  entry(rootstock, {
    alchemyHost: "rootstock-mainnet",
    defillamaChain: "rsk",
  }),
  entry(metis, {
    alchemyHost: "metis-mainnet",
    defillamaChain: "metis",
  }),
  entry(polygonZkEvm, {
    alchemyHost: "polygonzkevm-mainnet",
    defillamaChain: "polygon_zkevm",
  }),
  entry(moonbeam, {
    alchemyHost: "moonbeam-mainnet",
    defillamaChain: "moonbeam",
  }),
  entry(sei, {
    alchemyHost: "sei-mainnet",
    defillamaChain: "sei",
  }),
  entry(mantle, {
    alchemyHost: "mantle-mainnet",
    covalentName: "mantle-mainnet",
    defillamaChain: "mantle",
  }),
  entry(base, {
    alchemyHost: "base-mainnet",
    covalentName: "base-mainnet",
    defillamaChain: "base",
  }),
  entry(mode, {
    alchemyHost: "mode-mainnet",
    defillamaChain: "mode",
  }),
  entry(arbitrum, {
    alchemyHost: "arb-mainnet",
    covalentName: "arbitrum-mainnet",
    defillamaChain: "arbitrum",
  }),
  entry(celo, {
    alchemyHost: "celo-mainnet",
    defillamaChain: "celo",
  }),
  entry(avalanche, {
    alchemyHost: "avax-mainnet",
    covalentName: "avalanche-mainnet",
    defillamaChain: "avax",
  }),
  entry(ink, {
    alchemyHost: "ink-mainnet",
    defillamaChain: "ink",
  }),
  entry(linea, {
    alchemyHost: "linea-mainnet",
    covalentName: "linea-mainnet",
    defillamaChain: "linea",
  }),
  entry(blast, {
    alchemyHost: "blast-mainnet",
    covalentName: "blast-mainnet",
    defillamaChain: "blast",
  }),
  entry(taiko, {
    alchemyHost: "taiko-mainnet",
    defillamaChain: "taiko",
  }),
  entry(scroll, {
    alchemyHost: "scroll-mainnet",
    covalentName: "scroll-mainnet",
    defillamaChain: "scroll",
  }),
  entry(apeChain, {
    alchemyHost: "apechain-mainnet",
    defillamaChain: "apechain",
  }),
  entry(zksync, {
    alchemyHost: "zksync-mainnet",
    covalentName: "zksync-mainnet",
    defillamaChain: "era",
  }),
  entry(abstract, {
    alchemyHost: "abstract-mainnet",
    defillamaChain: "abstract",
  }),
  entry(soneium, {
    alchemyHost: "soneium-mainnet",
    defillamaChain: "soneium",
  }),
  entry(berachain, {
    alchemyHost: "berachain-mainnet",
    defillamaChain: "berachain",
  }),
  entry(zora, {
    alchemyHost: "zora-mainnet",
    defillamaChain: "zora",
  }),
]

const byId = new Map(EVM_CHAINS.map((chain) => [chain.id, chain]))
const preferredPublicRpc = new Map<number, string>()
const clients = new Map<number, PublicClient>()

export function getEvmChain(chainId: number) {
  return byId.get(chainId)
}

export function chainLabel(chainId: number) {
  return byId.get(chainId)?.name
}

export function assertEvmChains(chainIds: readonly number[]) {
  const unknown = chainIds.filter((chainId) => !byId.has(chainId))
  if (unknown.length > 0) {
    const supported = EVM_CHAINS.map((chain) => chain.id).join(", ")
    throw new Error(
      `Unsupported chain id ${unknown.join(", ")}. Sync supports ${supported}.`,
    )
  }
  return chainIds.map((chainId) => byId.get(chainId)!)
}

/** Official HTTP endpoints shipped with the viem chain definition. */
export function publicRpcUrls(chainId: number) {
  const urls = byId.get(chainId)?.chain.rpcUrls.default.http ?? []
  return [...new Set(urls.filter((url) => url.startsWith("https://")))]
}

export function rememberPublicRpc(chainId: number, url: string) {
  preferredPublicRpc.set(chainId, url)
  clients.delete(chainId)
}

/** Browser and wagmi transport. Public RPC only, so the Alchemy key stays off the client. */
export function getRpcUrl(chainId: number) {
  const remembered = preferredPublicRpc.get(chainId)
  if (remembered) return remembered
  const urls = publicRpcUrls(chainId)
  if (!urls[0]) {
    throw new Error(`No RPC URL for chain ${chainId}.`)
  }
  return urls[0]
}

/** Public RPC client. Server jobs that should use Alchemy call `getServerRpcClient`. */
export function getRpcClient(chainId: number): PublicClient {
  const existing = clients.get(chainId)
  if (existing) return existing
  const entryForChain = byId.get(chainId)
  if (!entryForChain) {
    throw new Error(`Unsupported chain id ${chainId}.`)
  }
  const client = createPublicClient({
    chain: entryForChain.chain,
    transport: http(getRpcUrl(chainId), { timeout: 20_000, retryCount: 1 }),
  })
  clients.set(chainId, client)
  return client
}
