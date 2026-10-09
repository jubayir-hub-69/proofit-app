import { formatUnits, type Hash } from "viem"
import { getServerRpcClient } from "@/lib/alchemy"
import type { SyncChain } from "@/lib/indexer/chains"
import {
  categorizeTransaction,
  economicValueUsd,
} from "@/lib/indexer/categorize"
import {
  gasFeeUsdFromReceipt,
  roundUsd,
  type GasPriceSource,
} from "@/lib/indexer/gas"
import { erc20TokenAddresses } from "@/lib/indexer/spam"
import type { IndexerName, NormalizedTransaction } from "@/lib/indexer/types"
import { recordSpend } from "@/lib/ledger"
import type { Json, TransactionRow } from "@/types/database"

function directionOf(wallet: string, from: string | null, to: string | null) {
  const target = wallet.toLowerCase()
  if (from?.toLowerCase() === target) return "out" as const
  if (to?.toLowerCase() === target) return "in" as const
  return "unknown" as const
}

export async function enrichTransaction(
  chain: SyncChain,
  wallet: `0x${string}`,
  tx: NormalizedTransaction,
  indexer: IndexerName,
  marketNativeUsd: number | null,
): Promise<{ row: TransactionRow; priceSource: GasPriceSource }> {
  let input = tx.input
  let to = tx.to
  let from = tx.from
  let gasUsed: bigint | null = null
  let effectiveGasPrice: bigint | null = null
  let l1FeeWei = BigInt(0)
  let nativeValueWei = BigInt(0)

  let client: ReturnType<typeof getServerRpcClient> | null = null
  try {
    client = getServerRpcClient(chain.id)
  } catch {
    client = null
  }
  const [transaction, receipt] = client
    ? await Promise.all([
        client.getTransaction({ hash: tx.hash as Hash }).catch(() => null),
        client.getTransactionReceipt({ hash: tx.hash as Hash }).catch(() => null),
      ])
    : [null, null]
  if (transaction) {
    input = transaction.input
    to = transaction.to
    from = transaction.from
    nativeValueWei = transaction.value
  }
  if (receipt) {
    gasUsed = receipt.gasUsed
    effectiveGasPrice = receipt.effectiveGasPrice
    const l1Fee = (receipt as { l1Fee?: bigint | null }).l1Fee
    if (typeof l1Fee === "bigint") l1FeeWei = l1Fee
  }

  const quoted = tx.quoteRate !== null && tx.quoteRate > 0
  const nativeUsd = quoted ? tx.quoteRate! : marketNativeUsd !== null && marketNativeUsd > 0 ? marketNativeUsd : 0
  let notionalUsd = tx.notionalUsd
  if ((notionalUsd === null || notionalUsd <= 0) && nativeValueWei > BigInt(0) && nativeUsd > 0) {
    notionalUsd = roundUsd(Number(formatUnits(nativeValueWei, 18)) * nativeUsd)
  }
  let gasFeeUsd = 0
  let priceSource: GasPriceSource = "unpriced"
  let feeWei = "0"

  if (gasUsed !== null && effectiveGasPrice !== null && nativeUsd > 0) {
    const priced = gasFeeUsdFromReceipt({
      gasUsed,
      effectiveGasPrice,
      l1FeeWei,
      nativeUsd,
    })
    gasFeeUsd = priced.gasFeeUsd
    feeWei = priced.feeWei.toString()
    priceSource = quoted ? "receipt" : "market"
  } else if (tx.providerGasUsd !== null) {
    gasFeeUsd = roundUsd(tx.providerGasUsd)
    priceSource = "provider"
  }

  const category = categorizeTransaction({
    to,
    input,
    logAddresses: tx.logAddresses,
    topics: tx.topics,
  })
  const direction = directionOf(wallet, from, to)
  const tokenAddresses = receipt ? erc20TokenAddresses(receipt.logs) : []
  const capitalSpentUsd =
    direction === "out" && notionalUsd !== null && notionalUsd > 0 ? notionalUsd : 0
  const spend = recordSpend({
    timestamp: tx.blockTimestamp,
    gasSpentUsd: gasFeeUsd,
    capitalSpentUsd,
  })
  const rawData: { [key: string]: Json } = {
    indexer,
    protocol: category.protocol,
    uncategorized: category.uncategorized,
    from,
    to,
    direction,
    notionalUsd,
    gasPriceSource: priceSource,
    gasUsed: gasUsed?.toString() ?? null,
    effectiveGasPrice: effectiveGasPrice?.toString() ?? null,
    l1FeeWei: l1FeeWei.toString(),
    feeWei,
    nativeUsd,
    tokenAddresses,
    spend: spend ? { timestamp: spend.timestamp, usd: spend.usd } : null,
  }

  return {
    priceSource,
    row: {
      id: `tx_${chain.id}_${tx.hash}`,
      wallet_address: wallet,
      tx_hash: tx.hash,
      chain_id: chain.id,
      block_timestamp: tx.blockTimestamp,
      type: category.type,
      gas_fee_usd: gasFeeUsd,
      value_usd: roundUsd(economicValueUsd(category.type, notionalUsd, direction)),
      campaign_id: category.campaignId,
      raw_data: rawData,
    },
  }
}
