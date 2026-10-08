"use client"

import { useState } from "react"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { goplusTokenSecurityUrl } from "@/lib/api"
import { supportedChains } from "@/lib/web3/config"
import { isAddress } from "viem"

export function SafetyView({ goplusConfigured }: { goplusConfigured: boolean }) {
  const [chainId, setChainId] = useState(String(supportedChains[0].id))
  const [target, setTarget] = useState("")
  const [preparedUrl, setPreparedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <PageHeader
        eyebrow="Risk"
        title="Safety Gate"
        description="Prepare a GoPlus token check for a contract address. This scaffold does not send the request."
      />

      <form
        className="rounded-xl border border-white/10 bg-zinc-900/70 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = target.trim()
          if (!isAddress(trimmed)) {
            setPreparedUrl(null)
            setError("Enter a valid contract address.")
            return
          }
          setError(null)
          setPreparedUrl(goplusTokenSecurityUrl(Number(chainId), trimmed))
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <label className="block text-sm text-zinc-300">
            <span className="mb-1.5 block text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
              Network
            </span>
            <select
              value={chainId}
              onChange={(event) => setChainId(event.target.value)}
              className="h-9 w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30"
            >
              {supportedChains.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-300">
            <span className="mb-1.5 block text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
              Contract
            </span>
            <Input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="0x… contract"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <Button type="submit">Prepare check</Button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        {preparedUrl ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-zinc-950/70 p-3">
            <p className="text-sm text-zinc-200">
              {goplusConfigured
                ? "GoPlus key is set. The request is still not sent from this screen."
                : "Add NEXT_PUBLIC_GOPLUS_API_KEY before a live check. The URL below has no token."}
            </p>
            <p className="mt-2 font-mono text-xs break-all text-zinc-500">
              {preparedUrl}
            </p>
          </div>
        ) : null}
      </form>

      <p className="mt-6 text-sm text-zinc-500">
        No checks have been sent. A prepared URL stays on this page until a live request is added.
      </p>
    </div>
  )
}
