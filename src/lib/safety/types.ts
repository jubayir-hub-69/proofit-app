export type RiskLevel = "low" | "medium" | "high"

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk / Warning",
}

export interface SafetyCheck {
  kind: "token" | "url"
  subject: string
  chainId: number | null
  level: RiskLevel | null
  label: string | null
  findings: string[]
  error: string | null
}

export interface SafetyScanResponse {
  ok: boolean
  level: RiskLevel | null
  label: string | null
  checks: SafetyCheck[]
  notice: string | null
  error: string | null
}

export interface ApprovalRow {
  chainId: number
  chain: string
  token: string
  tokenSymbol: string | null
  spender: string
  allowanceRaw: string
  decimals: number | null
  unlimited: boolean
}

export interface ChainAllowanceScan {
  chainId: number
  chain: string
  fromBlock: string | null
  toBlock: string | null
  partial: boolean
  truncated: boolean
  error: string | null
}

export interface AllowanceScanResponse {
  ok: boolean
  address: string | null
  lookbackBlocks: number
  approvals: ApprovalRow[]
  chains: ChainAllowanceScan[]
  error: string | null
}
