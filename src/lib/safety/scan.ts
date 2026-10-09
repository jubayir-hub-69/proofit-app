import { fetchJson, goplusPhishingSiteUrl, goplusTokenSecurityUrl } from "@/lib/api"
import { goplusAuthHeaders, goplusConfigured } from "@/lib/goplus-auth"
import { getEvmChain } from "@/lib/chains"
import { assessPhishing, assessToken, riskLabel, worstLevel } from "@/lib/safety/risk"
import type { SafetyCheck, SafetyScanResponse } from "@/lib/safety/types"
import { getAddress, isAddress } from "viem"

interface GoPlusBody {
  code?: number | string
  message?: string
  result?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function goplusOk(body: GoPlusBody) {
  return Number(body.code) === 1
}

function failureText(error: unknown, label: string) {
  return error instanceof Error ? error.message : label
}

const PUBLIC_FALLBACK_NOTICE =
  "The configured GoPlus key was rejected, so this result used the public endpoint."

async function goplusGet(url: string) {
  const configured = goplusConfigured()
  const headers = await goplusAuthHeaders()
  const authed = Boolean(
    headers && typeof headers === "object" && !Array.isArray(headers) && "Authorization" in headers,
  )
  if (configured && !authed) {
    const body = await fetchJson<GoPlusBody>(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
    return { body, fallback: true }
  }
  const body = await fetchJson<GoPlusBody>(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  const rejected = `${body.message ?? ""}`.toLowerCase().includes("signature")
  if (!authed || !rejected || goplusOk(body)) return { body, fallback: false }
  const retry = await fetchJson<GoPlusBody>(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  return { body: retry, fallback: true }
}

function tokenRecord(result: unknown, address: string) {
  const record = asRecord(result)
  if (!record) return null
  const direct = record[address.toLowerCase()]
  return asRecord(direct)
}

function checkFromReading(
  kind: SafetyCheck["kind"],
  subject: string,
  chainId: number | null,
  reading: { level: SafetyCheck["level"]; findings: string[] },
): SafetyCheck {
  return {
    kind,
    subject,
    chainId,
    level: reading.level,
    label: riskLabel(reading.level),
    findings: reading.findings,
    error: null,
  }
}

async function scanToken(
  chainId: number,
  address: string,
  fallbacks: boolean[],
): Promise<SafetyCheck> {
  const chain = getEvmChain(chainId)
  const subject = `${address} on ${chain?.name ?? `chain ${chainId}`}`
  try {
    const loaded = await goplusGet(goplusTokenSecurityUrl(chainId, address.toLowerCase()))
    if (loaded.fallback) fallbacks.push(true)
    const body = loaded.body
    if (!goplusOk(body)) {
      return {
        kind: "token",
        subject,
        chainId,
        level: null,
        label: null,
        findings: [],
        error: body.message?.trim() || "GoPlus token security did not return a result.",
      }
    }
    const record = tokenRecord(body.result, address)
    if (!record) {
      return {
        kind: "token",
        subject,
        chainId,
        level: null,
        label: null,
        findings: [],
        error: "GoPlus returned no security record for this contract.",
      }
    }
    const name = typeof record.token_name === "string" ? record.token_name : null
    const symbol = typeof record.token_symbol === "string" ? record.token_symbol : null
    const reading = assessToken(record)
    const title = [symbol, name].filter(Boolean).join(" · ")
    return checkFromReading("token", title ? `${title} · ${subject}` : subject, chainId, reading)
  } catch (error) {
    return {
      kind: "token",
      subject,
      chainId,
      level: null,
      label: null,
      findings: [],
      error: failureText(error, "GoPlus token security failed."),
    }
  }
}

function phishingFlag(result: unknown) {
  const record = asRecord(result)
  const value = record?.phishing_site
  if (value === 1 || value === "1" || value === true) return true
  if (value === 0 || value === "0" || value === false) return false
  return null
}

function contractHints(value: unknown, fallbackChainId: number, found: { address: string; chainId: number }[]) {
  if (found.length >= 3 || !value || typeof value !== "object") return
  if (Array.isArray(value)) {
    for (const item of value) contractHints(item, fallbackChainId, found)
    return
  }
  const record = value as Record<string, unknown>
  const raw = record.contract_address ?? record.contractAddress
  if (typeof raw === "string" && isAddress(raw)) {
    const chainRaw = record.chain_id ?? record.chainId
    const parsed = typeof chainRaw === "string" || typeof chainRaw === "number" ? Number(chainRaw) : NaN
    const chainId = getEvmChain(parsed) ? parsed : fallbackChainId
    const address = getAddress(raw)
    if (!found.some((item) => item.address === address && item.chainId === chainId)) {
      found.push({ address, chainId })
    }
  }
  for (const child of Object.values(record)) {
    if (found.length >= 3) break
    if (child && typeof child === "object") contractHints(child, fallbackChainId, found)
  }
}

function addressesInUrl(target: string, chainId: number) {
  const hints: { address: string; chainId: number }[] = []
  for (const match of target.match(/0x[a-fA-F0-9]{40}/g) ?? []) {
    if (!isAddress(match) || hints.length >= 3) continue
    const address = getAddress(match)
    if (!hints.some((item) => item.address === address)) hints.push({ address, chainId })
  }
  return hints
}

async function scanUrl(
  target: string,
  chainId: number,
  fallbacks: boolean[],
): Promise<SafetyCheck[]> {
  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return [
      {
        kind: "url",
        subject: target,
        chainId: null,
        level: null,
        label: null,
        findings: [],
        error: "Enter an http or https claim URL.",
      },
    ]
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return [
      {
        kind: "url",
        subject: target,
        chainId: null,
        level: null,
        label: null,
        findings: [],
        error: "Enter an http or https claim URL.",
      },
    ]
  }

  const href = parsed.toString()
  try {
    const loaded = await goplusGet(goplusPhishingSiteUrl(href))
    if (loaded.fallback) fallbacks.push(true)
    const body = loaded.body
    if (!goplusOk(body)) {
      return [
        {
          kind: "url",
          subject: href,
          chainId: null,
          level: null,
          label: null,
          findings: [],
          error: body.message?.trim() || "GoPlus phishing check did not return a result.",
        },
      ]
    }
    const flagged = phishingFlag(body.result)
    const urlCheck: SafetyCheck =
      flagged === null
        ? {
            kind: "url",
            subject: href,
            chainId: null,
            level: null,
            label: null,
            findings: [],
            error: "GoPlus did not return a phishing_site value.",
          }
        : checkFromReading("url", href, null, assessPhishing(flagged))
    const hints = addressesInUrl(href, chainId)
    contractHints(body.result, chainId, hints)
    const tokens: SafetyCheck[] = []
    for (const hint of hints.slice(0, 3)) {
      tokens.push(await scanToken(hint.chainId, hint.address, fallbacks))
    }
    return [urlCheck, ...tokens]
  } catch (error) {
    return [
      {
        kind: "url",
        subject: href,
        chainId: null,
        level: null,
        label: null,
        findings: [],
        error: failureText(error, "GoPlus phishing check failed."),
      },
    ]
  }
}

export async function scanTarget(target: string, chainId: number): Promise<SafetyScanResponse> {
  const trimmed = target.trim()
  if (!getEvmChain(chainId)) {
    return {
      ok: false,
      level: null,
      label: null,
      checks: [],
      notice: null,
      error: "Choose a chain from the registry.",
    }
  }

  const fallbacks: boolean[] = []
  const checks = isAddress(trimmed)
    ? [await scanToken(chainId, getAddress(trimmed), fallbacks)]
    : await scanUrl(trimmed, chainId, fallbacks)
  const level = worstLevel(checks.map((check) => check.level))
  const errors = checks.flatMap((check) => (check.error ? [check.error] : []))
  return {
    ok: level !== null,
    level,
    label: riskLabel(level),
    checks,
    notice: fallbacks.length > 0 ? PUBLIC_FALLBACK_NOTICE : null,
    error: level === null ? errors[0] ?? "GoPlus did not return a risk result." : null,
  }
}
