import { createConfig, createStorage, http, injected, noopStorage } from "wagmi"
import { EVM_CHAINS, getRpcUrl } from "@/lib/chains"
import { readInjectedProvider } from "@/lib/injected-provider"

const chains = EVM_CHAINS.map((item) => item.chain)
const [primary, ...others] = chains
if (!primary) {
  throw new Error("The EVM registry is empty.")
}

export const supportedChains = EVM_CHAINS

export const wagmiConfig = createConfig({
  chains: [primary, ...others],
  connectors: [
    injected({
      shimDisconnect: false,
      unstable_shimAsyncInject: false,
      target() {
        const provider = readInjectedProvider()
        if (!provider) return undefined
        return { id: "injected", name: "Injected", provider }
      },
    }),
  ],
  transports: Object.fromEntries(
    EVM_CHAINS.map((item) => [item.id, http(getRpcUrl(item.id))]),
  ) as Record<(typeof primary | (typeof others)[number])["id"], ReturnType<typeof http>>,
  multiInjectedProviderDiscovery: false,
  // Hydrate calls `store.persist.rehydrate()` when `ssr` is set. A null storage
  // leaves `persist` undefined and throws reading `rehydrate`. This store is a no-op.
  storage: createStorage({ storage: noopStorage }),
  ssr: true,
})
