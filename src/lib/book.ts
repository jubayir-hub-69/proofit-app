import { roundUsd } from "@/lib/indexer/gas"
import type {
  CampaignChecklistRow,
  CampaignRow,
  Json,
  TransactionRow,
} from "@/types/database"

export function rawRecord(value: Json | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value
}

export function isUnclassified(row: TransactionRow) {
  const raw = rawRecord(row.raw_data)
  return raw?.uncategorized === true || row.campaign_id === null
}

export function protocolLabel(
  row: TransactionRow,
  catalog: readonly CampaignRow[],
) {
  const named = catalog.find((campaign) => campaign.id === row.campaign_id)
  if (named) return named.name
  const protocol = rawRecord(row.raw_data)?.protocol
  return typeof protocol === "string" && protocol.length > 0
    ? protocol
    : "Unassigned"
}

export function netImpactUsd(row: TransactionRow) {
  return roundUsd(row.value_usd - row.gas_fee_usd)
}

/** Templates stay visible until a wallet-specific completion row exists. */
export function checklistForWallet(
  rows: readonly CampaignChecklistRow[],
  address: string,
) {
  return rows.filter((row) => {
    if (row.wallet_address === null) {
      const clone = rows.some(
        (other) =>
          other.campaign_id === row.campaign_id &&
          other.title === row.title &&
          other.wallet_address?.toLowerCase() === address.toLowerCase(),
      )
      return !clone
    }
    return row.wallet_address.toLowerCase() === address.toLowerCase()
  })
}
