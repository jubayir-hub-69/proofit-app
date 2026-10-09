"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { LegalDisclaimer } from "@/components/legal-disclaimer"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWatchAddress } from "@/hooks/use-watch-address"
import { EVM_CHAINS } from "@/lib/chains"
import { capitalBandOf, filterFeedItems } from "@/lib/feed/filter"
import type { CapitalBand, FeedItem, FeedResponse } from "@/lib/feed/types"
import { formatChain, formatTimestamp, formatUsd } from "@/lib/formatters"

const selectClass =
  "h-9 w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30"

const CAPITAL_OPTIONS: { value: CapitalBand; label: string }[] = [
  { value: "all", label: "All capital" },
  { value: "free", label: "$0 Free/Testnet" },
  { value: "low", label: "<$50 Low" },
  { value: "mid", label: ">$100 Mid" },
]

function httpUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

function bandLabel(item: FeedItem) {
  const band = capitalBandOf(item.capitalUsd)
  if (band === "free") return "$0 Free/Testnet"
  if (band === "low") return "<$50 Low"
  if (band === "mid") return ">$100 Mid"
  return null
}

export function FeedView({ telegramConfigured }: { telegramConfigured: boolean }) {
  const { address } = useWatchAddress()
  const [items, setItems] = useState<FeedItem[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chainId, setChainId] = useState("all")
  const [capital, setCapital] = useState<CapitalBand>("all")
  const [region, setRegion] = useState("")
  const [chatId, setChatId] = useState("")
  const [sending, setSending] = useState(false)
  const [alertMessage, setAlertMessage] = useState<string | null>(null)
  const [alertError, setAlertError] = useState<string | null>(null)

  async function loadFeed() {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await fetch("/api/feed", { signal: AbortSignal.timeout(20_000) })
      const body = (await response.json()) as FeedResponse
      if (!body || !Array.isArray(body.items)) {
        throw new Error("Feed returned an unexpected response.")
      }
      setItems(body.items)
      setNotice(body.notice)
      if (!body.ok && body.error) setLoadError(body.error)
    } catch (error) {
      setItems([])
      setLoadError(error instanceof Error ? error.message : "The feed request failed.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFeed()
  }, [])

  const regions = useMemo(() => {
    const values = new Set<string>()
    for (const item of items) {
      for (const entry of item.regions) values.add(entry)
    }
    return [...values].sort((left, right) => left.localeCompare(right))
  }, [items])

  const visible = useMemo(
    () => filterFeedItems(items, { chainId, capital, region }),
    [items, chainId, capital, region],
  )

  async function sendAlert(event: FormEvent) {
    event.preventDefault()
    setSending(true)
    setAlertError(null)
    setAlertMessage(null)
    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chatId.trim(),
          walletAddress: address ?? undefined,
        }),
        signal: AbortSignal.timeout(20_000),
      })
      const body = (await response.json()) as {
        ok?: boolean
        sent?: boolean
        matched?: number
        persisted?: boolean
        notice?: string | null
        error?: string
      }
      if (!response.ok || !body.ok || !body.sent) {
        throw new Error(body.error || "Telegram alert was not sent.")
      }
      const count = body.matched ?? 0
      const stored = body.persisted ? " Chat id stored." : ""
      const extra = body.notice ? ` ${body.notice}` : ""
      setAlertMessage(
        count === 0
          ? `Telegram alert sent. No upcoming deadlines were included.${stored}${extra}`
          : `Telegram alert sent for ${count} stored deadline${count === 1 ? "" : "s"}.${stored}${extra}`,
      )
    } catch (error) {
      setAlertError(error instanceof Error ? error.message : "Telegram alert was not sent.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Opportunities"
        title="Today Feed"
        description="Stored opportunities from Supabase. Filters run on those rows. Nothing on this page is a sample card."
        action={
          <Button type="button" variant="outline" onClick={() => void loadFeed()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <label className="block text-sm text-zinc-300">
          <span className="mb-1.5 block text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
            Chain
          </span>
          <select value={chainId} onChange={(event) => setChainId(event.target.value)} className={selectClass}>
            <option value="all">All chains</option>
            {EVM_CHAINS.map((chain) => (
              <option key={chain.id} value={chain.id}>
                {chain.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-zinc-300">
          <span className="mb-1.5 block text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
            Capital required
          </span>
          <select
            value={capital}
            onChange={(event) => setCapital(event.target.value as CapitalBand)}
            className={selectClass}
          >
            {CAPITAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-zinc-300">
          <span className="mb-1.5 block text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
            Eligible region
          </span>
          <Input
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            placeholder="All regions"
            list="feed-regions"
            spellCheck={false}
          />
          <datalist id="feed-regions">
            {regions.map((entry) => (
              <option key={entry} value={entry} />
            ))}
          </datalist>
        </label>
      </div>
      <p className="mb-4 text-xs leading-5 text-zinc-500">
        $0 matches Free/Testnet, amounts under $50 match Low, and amounts over $100 match Mid.
        Amounts from $50 through $100 stay visible on All capital. An empty region list means no
        restriction was stored, so that item stays visible for every region.
      </p>

      {loadError ? <p className="mb-4 text-sm text-rose-300">{loadError}</p> : null}
      {notice ? <p className="mb-4 text-sm text-zinc-300">{notice}</p> : null}
      {loading ? <p className="text-sm text-zinc-400">Loading stored feed items…</p> : null}

      {!loading && items.length > 0 && visible.length === 0 ? (
        <p className="text-sm text-zinc-300">No stored items match these filters.</p>
      ) : null}

      {visible.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-950/70 text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Opportunity</th>
                <th className="px-4 py-3 font-medium">Chain</th>
                <th className="px-4 py-3 font-medium">Capital</th>
                <th className="px-4 py-3 font-medium">Regions</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const link = httpUrl(item.url)
                const band = bandLabel(item)
                return (
                  <tr key={item.id} className="border-t border-white/10 align-top">
                    <td className="px-4 py-3">
                      <p className="text-zinc-100">{item.title}</p>
                      {item.summary ? <p className="mt-1 text-xs text-zinc-500">{item.summary}</p> : null}
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block text-xs break-all text-emerald-300"
                        >
                          {link}
                        </a>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {item.chainId === null ? "—" : formatChain(item.chainId)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-zinc-100">
                        {item.capitalUsd === null ? "—" : formatUsd(item.capitalUsd)}
                      </p>
                      {band ? (
                        <Badge tone="neutral" className="mt-1">
                          {band}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {item.regions.length === 0 ? "Unrestricted" : item.regions.join(", ")}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {item.deadline ? formatTimestamp(item.deadline) : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <form className="mt-8 rounded-xl border border-white/10 bg-zinc-900/70 p-4" onSubmit={sendAlert}>
        <h2 className="text-sm font-medium text-zinc-100">Telegram deadline alert</h2>
        <p className="mt-1 text-sm text-zinc-400">
          {telegramConfigured
            ? "TELEGRAM_BOT_TOKEN is set on the server. The token stays there."
            : "TELEGRAM_BOT_TOKEN is not set. A send will fail until the server has the token."}
          {address
            ? " Deadlines are limited to campaigns tagged on the watched address."
            : " No watched address is set, so the alert includes every stored upcoming deadline."}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block text-sm text-zinc-300">
            <span className="mb-1.5 block text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
              Telegram chat id
            </span>
            <Input
              value={chatId}
              onChange={(event) => setChatId(event.target.value)}
              inputMode="numeric"
              placeholder="Numeric chat id"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <Button type="submit" disabled={sending}>
            {sending ? "Sending…" : "Send deadline alert"}
          </Button>
        </div>
        {alertError ? <p className="mt-3 text-sm text-rose-300">{alertError}</p> : null}
        {alertMessage ? <p className="mt-3 text-sm text-zinc-300">{alertMessage}</p> : null}
      </form>

      <LegalDisclaimer />
    </div>
  )
}
