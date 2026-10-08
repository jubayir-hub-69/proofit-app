import type { DbTransactionType } from "@/types/database"

const APPROVE_SELECTOR = "0x095ea7b3"
const TRANSFER_SELECTOR = "0xa9059cbb"
const CLAIM_SELECTORS = ["0x4e71d92d", "0x2e7ba6ef", "0x379607f5"]
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"

export interface ProtocolRule {
  campaignId: string
  protocol: string
  type: DbTransactionType
  addresses: readonly string[]
}

/**
 * Known routers and pools on Base, Arbitrum, and Polygon.
 * Matching tags a transaction onto a campaign. It does not change custody.
 */
export const PROTOCOL_RULES: readonly ProtocolRule[] = [
  {
    campaignId: "cmp_uniswap",
    protocol: "Uniswap",
    type: "swap",
    addresses: [
      "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
      "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
    ],
  },
  {
    campaignId: "cmp_across",
    protocol: "Across",
    type: "bridge",
    addresses: [
      "0x09aea4b2242abc8bb4bb78d537a67a245a7bec64",
      "0xe35e9842fceaca96570b734083f4a58e8f7c5f2a",
      "0x9295ee1d8c5b022be115a2ad3c30c72e34e7f096",
    ],
  },
  {
    campaignId: "cmp_lifi",
    protocol: "LI.FI",
    type: "bridge",
    addresses: ["0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae"],
  },
  {
    campaignId: "cmp_aave",
    protocol: "Aave",
    type: "transfer",
    addresses: [
      "0xa238dd80c259a72e81d7e4664a9801593f98d1c5",
      "0x794a61358d6845594f94dc1db02a252b5b4814ad",
    ],
  },
]

export interface CategorizeInput {
  to: string | null
  input: string | null
  logAddresses: readonly string[]
  topics: readonly string[]
}

export interface CategoryMatch {
  type: DbTransactionType
  campaignId: string | null
  protocol: string | null
  uncategorized: boolean
}

function selectorOf(input: string | null) {
  if (!input || input.length < 10) return null
  return input.slice(0, 10).toLowerCase()
}

function findProtocol(addresses: readonly (string | null)[]) {
  const set = new Set(
    addresses
      .filter((address): address is string => Boolean(address))
      .map((address) => address.toLowerCase()),
  )
  return PROTOCOL_RULES.find((rule) =>
    rule.addresses.some((address) => set.has(address)),
  )
}

export function categorizeTransaction(input: CategorizeInput): CategoryMatch {
  const selector = selectorOf(input.input)
  const protocol = findProtocol([input.to, ...input.logAddresses])
  const approval =
    selector === APPROVE_SELECTOR ||
    input.topics.some((topic) => topic.toLowerCase() === APPROVAL_TOPIC)
  const claim = selector !== null && CLAIM_SELECTORS.includes(selector)

  if (approval) {
    return {
      type: "approval",
      campaignId: protocol?.campaignId ?? null,
      protocol: protocol?.protocol ?? null,
      uncategorized: !protocol,
    }
  }

  if (protocol) {
    return {
      type: protocol.type,
      campaignId: protocol.campaignId,
      protocol: protocol.protocol,
      uncategorized: false,
    }
  }

  if (claim) {
    return {
      type: "claim",
      campaignId: null,
      protocol: null,
      uncategorized: false,
    }
  }

  if (selector === TRANSFER_SELECTOR || selector === null) {
    return {
      type: "transfer",
      campaignId: null,
      protocol: null,
      uncategorized: selector !== null,
    }
  }

  return {
    type: "transfer",
    campaignId: null,
    protocol: null,
    uncategorized: true,
  }
}

/** Economic credit toward ROI. Swap notional is not treated as profit. */
export function economicValueUsd(
  type: DbTransactionType,
  notionalUsd: number | null,
  direction: "in" | "out" | "unknown",
) {
  if (notionalUsd === null || notionalUsd <= 0) return 0
  if (type === "claim") return notionalUsd
  if (type === "transfer" && direction === "in") return notionalUsd
  return 0
}
