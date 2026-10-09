export const PORTFOLIO_CHAIN_IDS = [1, 56, 42161, 8453, 137] as const

export type PortfolioChainId = (typeof PORTFOLIO_CHAIN_IDS)[number]

export type PriceStatus = "priced" | "unlisted" | "unavailable"

export type NetWorthStatus = "empty" | "complete" | "partial" | "unlisted" | "unavailable"

export interface PortfolioHolding {
  chainId: number
  network: string
  /** Null for the chain's native coin. */
  contract: string | null
  symbol: string | null
  name: string | null
  decimals: number | null
  balanceRaw: string
  /** Human amount. Null when decimals are unknown. */
  balance: string | null
  priceUsd: number | null
  valueUsd: number | null
  priceStatus: PriceStatus
}

export interface PortfolioChain {
  chainId: number
  network: string
  ok: boolean
  holdingCount: number
  error: string | null
}

export interface PortfolioResponse {
  ok: true
  address: string
  chains: PortfolioChain[]
  holdings: PortfolioHolding[]
  netWorthUsd: number | null
  pricedCount: number
  unpricedCount: number
  netWorthStatus: NetWorthStatus
  notice: string | null
}
