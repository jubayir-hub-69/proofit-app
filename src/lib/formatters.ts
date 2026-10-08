import { formatUnits } from "viem"

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
}

export function formatUsd(value: number, options?: { signed?: boolean }) {
  const formatted = usdFormatter.format(value)
  if (options?.signed && value > 0) return `+${formatted}`
  return formatted
}

export function formatChain(chainId: number) {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}

export function shortenAddress(address: string, chars = 4) {
  if (!address.startsWith("0x") || address.length <= chars * 2 + 2) {
    return address
  }
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}

/** Format an ISO timestamp without `Date`, so prerender stays deterministic. */
export function formatTimestamp(iso: string) {
  const [date, time = ""] = iso.split("T")
  const [year, month, day] = date.split("-")
  const monthIndex = Number(month) - 1
  const monthLabel = MONTHS[monthIndex] ?? month
  const clock = time.slice(0, 5)
  if (!year || !day || !clock) return iso
  return `${Number(day)} ${monthLabel} ${year} · ${clock} UTC`
}

export function formatTokenAmount(value: bigint, decimals = 18, digits = 4) {
  const formatted = formatUnits(value, decimals)
  const [whole, fraction = ""] = formatted.split(".")
  const trimmed = fraction.slice(0, digits).replace(/0+$/, "")
  return trimmed ? `${whole}.${trimmed}` : whole
}
