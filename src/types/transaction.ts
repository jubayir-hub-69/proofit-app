export const TRANSACTION_KINDS = [
  "swap",
  "bridge",
  "claim",
  "approval",
  "transfer",
  "contract",
] as const

export type TransactionKind = (typeof TRANSACTION_KINDS)[number]

export const transactionKindLabel: Record<TransactionKind, string> = {
  swap: "Swap",
  bridge: "Bridge",
  claim: "Claim",
  approval: "Approval",
  transfer: "Transfer",
  contract: "Contract",
}

/** One economic event in the net-ROI book. Amounts are USD. */
export interface LedgerTransaction {
  hash: `0x${string}`
  chainId: number
  wallet: `0x${string}`
  kind: TransactionKind
  protocol: string
  /** ISO-8601 timestamp. Kept as a string so render stays deterministic. */
  timestamp: string
  gasSpentUsd: number
  valueUsd: number
  /** Signed contribution to net ROI after gas. */
  netUsd: number
  tokenSymbol: string | null
}
