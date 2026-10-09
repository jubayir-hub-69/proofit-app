import { RISK_LABEL, type RiskLevel } from "@/lib/safety/types"
import { isAddress } from "viem"

export interface RiskReading {
  level: RiskLevel | null
  findings: string[]
}

const RANK: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 }

function flag(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return value === "1" || value === 1 || value === true
}

function hasKey(record: Record<string, unknown>, key: string) {
  return key in record && record[key] !== "" && record[key] !== null && record[key] !== undefined
}

/** GoPlus tax strings are fractions. Values above 1 are treated as percents. */
function taxFraction(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null
  const raw = typeof value === "number" ? value : Number(value.trim())
  if (!Number.isFinite(raw) || raw < 0) return null
  return raw > 1 ? raw / 100 : raw
}

function percent(fraction: number) {
  const value = Math.round(fraction * 10000) / 100
  return `${value}%`
}

function raise(current: RiskLevel | null, next: RiskLevel) {
  if (!current || RANK[next] > RANK[current]) return next
  return current
}

function fakeToken(record: Record<string, unknown>) {
  const value = record.fake_token
  if (value === "1" || value === 1 || value === true) return true
  return Boolean(value && typeof value === "object")
}

/**
 * Score a GoPlus token record. Missing fields stay unknown.
 * A level is returned only when a requested risk field was actually present.
 */
export function assessToken(record: Record<string, unknown>): RiskReading {
  const findings: string[] = []
  let level: RiskLevel | null = null
  let scored = false

  if (hasKey(record, "is_honeypot")) {
    scored = true
    const honeypot = flag(record, "is_honeypot")
    findings.push(honeypot ? "Honeypot status: yes" : "Honeypot status: no")
    if (honeypot) level = raise(level, "high")
  }

  const buy = hasKey(record, "buy_tax") ? taxFraction(record.buy_tax) : null
  if (buy !== null) {
    scored = true
    findings.push(`Buy tax: ${percent(buy)}`)
    if (buy > 0.1) level = raise(level, "medium")
  }

  const sell = hasKey(record, "sell_tax") ? taxFraction(record.sell_tax) : null
  if (sell !== null) {
    scored = true
    findings.push(`Sell tax: ${percent(sell)}`)
    if (sell > 0.1) level = raise(level, "medium")
  }

  if (hasKey(record, "is_blacklisted")) {
    scored = true
    const listed = flag(record, "is_blacklisted")
    findings.push(listed ? "Blacklist: yes" : "Blacklist: no")
    if (listed) level = raise(level, "high")
  }

  if (hasKey(record, "honeypot_with_same_creator")) {
    scored = true
    const malicious = flag(record, "honeypot_with_same_creator")
    findings.push(
      malicious
        ? "Malicious creator: honeypot with the same creator"
        : "Malicious creator: same-creator honeypot flag is clear",
    )
    if (malicious) level = raise(level, "high")
  }

  if (fakeToken(record)) {
    scored = true
    findings.push("Malicious creator: fake token flag")
    level = raise(level, "high")
  }

  if (hasKey(record, "is_airdrop_scam") && flag(record, "is_airdrop_scam")) {
    scored = true
    findings.push("Airdrop scam flag")
    level = raise(level, "high")
  }

  const creator = record.creator_address
  if (typeof creator === "string" && isAddress(creator)) {
    findings.push(`Creator: ${creator}`)
  }

  if (hasKey(record, "owner_change_balance") && flag(record, "owner_change_balance")) {
    scored = true
    findings.push("Owner can change balances")
    level = raise(level, "high")
  }

  const hidden = hasKey(record, "hidden_owner") && flag(record, "hidden_owner")
  const takeBack =
    hasKey(record, "can_take_back_ownership") && flag(record, "can_take_back_ownership")
  if (hidden && takeBack) {
    scored = true
    findings.push("Hidden owner can take back ownership")
    level = raise(level, "high")
  } else if (takeBack) {
    scored = true
    findings.push("Ownership can be taken back")
    level = raise(level, "medium")
  }

  if (hasKey(record, "is_mintable") && flag(record, "is_mintable")) {
    scored = true
    findings.push("Mint function is present")
    level = raise(level, "medium")
  }

  if (hasKey(record, "is_open_source")) {
    scored = true
    const open = flag(record, "is_open_source")
    const trusted = hasKey(record, "trust_list") && flag(record, "trust_list")
    if (!open && !trusted) {
      findings.push("Contract is not open source")
      level = raise(level, "medium")
    } else if (open) {
      findings.push("Contract is open source")
    }
  }

  if (!scored) {
    return {
      level: null,
      findings: ["GoPlus did not return honeypot, tax, blacklist, or creator fields."],
    }
  }

  return { level: level ?? "low", findings }
}

export function assessPhishing(phishingSite: boolean): RiskReading {
  if (phishingSite) {
    return { level: "high", findings: ["Phishing site: yes"] }
  }
  return { level: "low", findings: ["Phishing site: no"] }
}

export function worstLevel(levels: readonly (RiskLevel | null)[]) {
  let best: RiskLevel | null = null
  for (const level of levels) {
    if (level) best = raise(best, level)
  }
  return best
}

export function riskLabel(level: RiskLevel | null) {
  return level ? RISK_LABEL[level] : null
}
