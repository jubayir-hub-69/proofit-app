export type IndexerName = "covalent" | "alchemy" | "public"

/** One transaction before receipt pricing and campaign tagging. */
export interface NormalizedTransaction {
  hash: `0x${string}`
  chainId: number
  from: string | null
  to: string | null
  blockTimestamp: string
  input: `0x${string}` | null
  logAddresses: string[]
  topics: string[]
  notionalUsd: number | null
  quoteRate: number | null
  providerGasUsd: number | null
}
