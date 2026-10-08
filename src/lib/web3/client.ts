import { createPublicClient, http, type Chain, type PublicClient } from "viem"
import { mainnet } from "viem/chains"
import { rpcHttpUrl } from "@/lib/web3/config"

/** Read-only client. Alchemy when configured, otherwise a public RPC. */
export function getPublicClient(chain: Chain = mainnet): PublicClient {
  return createPublicClient({
    chain,
    transport: http(rpcHttpUrl(chain.id), { timeout: 20_000, retryCount: 1 }),
  })
}
