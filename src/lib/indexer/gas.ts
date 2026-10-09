import { formatUnits } from "viem"

export type GasPriceSource = "receipt" | "provider" | "market" | "unpriced"

export function roundUsd(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export interface ReceiptGasInput {
  gasUsed: bigint
  effectiveGasPrice: bigint
  /** OP-stack L1 data fee, in wei. Arbitrum leaves this at zero. */
  l1FeeWei?: bigint
  nativeUsd: number
}

/** `gasUsed * effectiveGasPrice + l1Fee`, then convert with the native USD rate. */
export function gasFeeUsdFromReceipt(input: ReceiptGasInput) {
  const executionWei = input.gasUsed * input.effectiveGasPrice
  const l1FeeWei = input.l1FeeWei ?? BigInt(0)
  const feeWei = executionWei + l1FeeWei
  const native = Number(formatUnits(feeWei, 18))
  return {
    feeWei,
    executionWei,
    l1FeeWei,
    gasFeeUsd: roundUsd(native * input.nativeUsd),
  }
}
