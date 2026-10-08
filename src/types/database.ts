import type { CampaignStatus } from "@/types/campaign"

/**
 * Supabase / Postgres row types for the Proofit core.
 * Column names match `supabase/schema.sql`.
 * Ids are text so the app can use stable keys before a database assigns them.
 */

export const DB_TRANSACTION_TYPES = [
  "swap",
  "bridge",
  "approval",
  "claim",
  "transfer",
] as const

export type DbTransactionType = (typeof DB_TRANSACTION_TYPES)[number]

export const CAMPAIGN_CATEGORIES = [
  "airdrop",
  "points",
  "quest",
  "retro",
  "bridge",
  "swap",
  "other",
] as const

export type CampaignCategory = (typeof CAMPAIGN_CATEGORIES)[number]

export type ChecklistKind = "contract" | "action"

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json }

export interface WalletRow {
  id: string
  address: string
  label: string | null
  tags: string[]
  created_at: string
}

export interface CampaignRow {
  id: string
  name: string
  slug: string
  description: string | null
  category: CampaignCategory
  status: CampaignStatus
  estimated_reward_usd: number
}

export interface TransactionRow {
  id: string
  wallet_address: string
  tx_hash: string
  chain_id: number
  block_timestamp: string
  type: DbTransactionType
  gas_fee_usd: number
  value_usd: number
  campaign_id: string | null
  raw_data: Json | null
}

export interface CampaignChecklistRow {
  id: string
  campaign_id: string
  title: string
  type: ChecklistKind
  contract_address: string | null
  is_completed: boolean
  wallet_address: string | null
}

type OptionalInsert<T, Required extends keyof T> = Pick<T, Required> &
  Partial<Omit<T, Required>>

/** Shape expected by `createClient<Database>()` once the Supabase client is added. */
export interface Database {
  public: {
    Tables: {
      wallets: {
        Row: WalletRow
        Insert: OptionalInsert<WalletRow, "address">
        Update: Partial<WalletRow>
      }
      campaigns: {
        Row: CampaignRow
        Insert: OptionalInsert<
          CampaignRow,
          "name" | "slug" | "category" | "status"
        >
        Update: Partial<CampaignRow>
      }
      transactions: {
        Row: TransactionRow
        Insert: OptionalInsert<
          TransactionRow,
          "wallet_address" | "tx_hash" | "chain_id" | "block_timestamp" | "type"
        >
        Update: Partial<TransactionRow>
      }
      campaign_checklist: {
        Row: CampaignChecklistRow
        Insert: OptionalInsert<
          CampaignChecklistRow,
          "campaign_id" | "title" | "type"
        >
        Update: Partial<CampaignChecklistRow>
      }
    }
  }
}

export interface DatabaseSchema {
  wallets: WalletRow
  campaigns: CampaignRow
  transactions: TransactionRow
  campaign_checklist: CampaignChecklistRow
  safetyChecks: SafetyCheckRecord
  journalEntries: JournalEntryRecord
}

export type SafetyRiskLevel = "low" | "medium" | "high" | "unknown"

export interface SafetyCheckRecord {
  id: string
  target: `0x${string}`
  chainId: number
  riskLevel: SafetyRiskLevel
  summary: string
  checkedAt: string
}

export interface JournalEntryRecord {
  id: string
  title: string
  body: string
  createdAt: string
}
