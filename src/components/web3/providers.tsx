"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useState, type ReactNode } from "react"
import { WagmiProvider } from "wagmi"
import { enableInjectedProviderReads } from "@/lib/injected-provider"
import { wagmiConfig } from "@/lib/web3/config"

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

export function AppProviders({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    enableInjectedProviderReads()
    setMounted(true)
  }, [])

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <div data-wallet-ready={mounted ? "true" : "false"} className="contents">
          {children}
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
