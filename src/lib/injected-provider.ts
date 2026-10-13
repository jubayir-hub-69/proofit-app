import type { EIP1193Provider } from "viem"

type InjectedEthereum = EIP1193Provider & {
  off?: EIP1193Provider["removeListener"]
}

let readsEnabled = typeof window !== "undefined"

/** Called from the provider's mount effect. Reads stay closed during SSR. */
export function enableInjectedProviderReads() {
  readsEnabled = true
}

/**
 * Read `window.ethereum` without assigning it or changing its property descriptor.
 * The returned object is a separate delegate, so wallet shims cannot write back
 * onto the extension provider (Bitget's evmAsk.js throws if `ethereum` is redefined).
 */
function readEthereum() {
  const browser = window as Window & { ethereum?: unknown }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(browser, "ethereum")
    if (descriptor?.get) return descriptor.get.call(browser)
    if (descriptor) return descriptor.value
  } catch {
    // Fall through to a direct read. The property is never assigned.
  }
  return browser.ethereum
}

/**
 * The real injected provider, wrapped so wagmi can attach listeners without
 * redefining `window.ethereum`. Bitget throws when that property is replaced.
 * `request` stays bound to the extension object, so `eth_requestAccounts` opens
 * the extension popup.
 */
export function readInjectedProvider(): EIP1193Provider | undefined {
  if (!readsEnabled || typeof window === "undefined") return undefined
  try {
    const value = readEthereum()
    if (!value || typeof value !== "object") return undefined
    const provider = value as InjectedEthereum
    if (typeof provider.request !== "function") return undefined
    return new Proxy(provider, {
      get(target, prop) {
        if (prop === "removeListener" && typeof target.removeListener !== "function") {
          if (typeof target.off === "function") return target.off.bind(target)
          return () => {}
        }
        const current = Reflect.get(target, prop, target)
        return typeof current === "function" ? current.bind(target) : current
      },
      set() {
        return true
      },
    }) as EIP1193Provider
  } catch {
    return undefined
  }
}
