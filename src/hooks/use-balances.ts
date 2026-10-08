"use client"

import { useBalance } from "wagmi"
import { mainnet } from "wagmi/chains"
import { useWatchAddress } from "@/hooks/use-watch-address"

/** Native balance for the watched address on Ethereum. Disabled until the address is valid. */
export function useBalances() {
  const { address, isValid } = useWatchAddress()
  const query = useBalance({
    address,
    chainId: mainnet.id,
    query: {
      enabled: isValid,
    },
  })

  return {
    address,
    symbol: query.data?.symbol ?? "ETH",
    value: query.data?.value,
    decimals: query.data?.decimals ?? 18,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
  }
}
