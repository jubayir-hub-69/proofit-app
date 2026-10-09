import type { Chain, PublicClient } from "viem"
import { mainnet } from "viem/chains"
import { getRpcClient } from "@/lib/chains"

/** Read-only public client. Server routes use `getServerRpcClient` when Alchemy is configured. */
export function getPublicClient(chain: Chain = mainnet): PublicClient {
  return getRpcClient(chain.id)
}
