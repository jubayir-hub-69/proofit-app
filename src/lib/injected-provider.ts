import type { EIP1193Provider } from "viem"

type InjectedEthereum = EIP1193Provider & {
  off?: EIP1193Provider["removeListener"]
}

let readsEnabled = false

/** Called from the provider's mount effect. Reads stay closed during SSR. */
export function enableInjectedProviderReads() {
  readsEnabled = true
}

/**
 * Read `window.ethereum` without assigning it or changing its property descriptor.
 * The returned object is a separate delegate, so wallet shims cannot write back
 * onto the extension provider (Bitget's evmAsk.js throws if `ethereum` is redefined).
 */
export function readInjectedProvider(): EIP1193Provider | undefined {
  if (!readsEnabled || typeof window === "undefined") return undefined
  try {
    const browser = window as Window & { ethereum?: unknown }
    const descriptor = Object.getOwnPropertyDescriptor(browser, "ethereum")
    const value = descriptor
      ? descriptor.get
        ? descriptor.get.call(browser)
        : descriptor.value
      : browser.ethereum
    if (!value || typeof value !== "object") return undefined
    const provider = value as InjectedEthereum
    if (typeof provider.request !== "function") return undefined
    const on = typeof provider.on === "function" ? provider.on.bind(provider) : () => {}
    const removeListener =
      provider.removeListener?.bind(provider) ?? provider.off?.bind(provider) ?? (() => {})
    return {
      request: provider.request.bind(provider),
      on,
      removeListener,
    }
  } catch {
    return undefined
  }
}
