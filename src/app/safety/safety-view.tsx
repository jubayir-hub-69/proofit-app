"use client"

import { useState, type FormEvent } from "react"
import { LegalDisclaimer } from "@/components/legal-disclaimer"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWatchAddress } from "@/hooks/use-watch-address"
import { formatTokenAmount, shortenAddress } from "@/lib/formatters"
import type {
  AllowanceScanResponse,
  ApprovalRow,
  RiskLevel,
  SafetyScanResponse,
} from "@/lib/safety/types"
import { supportedChains, wagmiConfig } from "@/lib/web3/config"
import { erc20Abi, getAddress, isAddress } from "viem"
import { useConnect, useConnection, useConnectors, useSwitchChain, useWriteContract } from "wagmi"

const selectClass =
  "h-9 w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30"

type AppChainId = (typeof wagmiConfig.chains)[number]["id"]

function appChainId(chainId: number): AppChainId | null {
  const match = wagmiConfig.chains.find((chain) => chain.id === chainId)
  return match ? match.id : null
}

function riskTone(level: RiskLevel | null) {
  if (level === "low") return "positive" as const
  if (level === "medium") return "warning" as const
  if (level === "high") return "danger" as const
  return "neutral" as const
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed."
  return message.length > 300 ? `${message.slice(0, 300)}…` : message
}

function allowanceLabel(row: ApprovalRow) {
  if (row.unlimited) return "Unlimited"
  if (row.decimals === null) return row.allowanceRaw
  try {
    return formatTokenAmount(BigInt(row.allowanceRaw), row.decimals)
  } catch {
    return row.allowanceRaw
  }
}

export function SafetyView({ goplusConfigured }: { goplusConfigured: boolean }) {
  const { address } = useWatchAddress()
  const connection = useConnection()
  const connectors = useConnectors()
  const { mutateAsync: connectAsync, isPending: connecting } = useConnect()
  const { mutateAsync: switchChainAsync } = useSwitchChain()
  const { mutateAsync: writeAsync, isPending: writing } = useWriteContract()
  const [chainId, setChainId] = useState(String(supportedChains[0]?.id ?? 1))
  const [target, setTarget] = useState("")
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [report, setReport] = useState<SafetyScanResponse | null>(null)
  const [allowanceScan, setAllowanceScan] = useState<AllowanceScanResponse | null>(null)
  const [allowanceError, setAllowanceError] = useState<string | null>(null)
  const [scanningAllowances, setScanningAllowances] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [revokeHash, setRevokeHash] = useState<string | null>(null)

  const connector = connectors.find((item) => item.type === "injected") ?? connectors[0]
  const connectedAddress = connection.address
  const sameWallet = Boolean(
    address && connectedAddress && getAddress(connectedAddress) === address,
  )
  const revokeHref = address ? `https://revoke.cash/address/${address}` : null

  async function scanContract(event: FormEvent) {
    event.preventDefault()
    const trimmed = target.trim()
    if (!trimmed) {
      setReport(null)
      setScanError("Enter a contract address or a claim URL.")
      return
    }
    setScanning(true)
    setScanError(null)
    setReport(null)
    try {
      const response = await fetch("/api/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: trimmed, chainId: Number(chainId) }),
        signal: AbortSignal.timeout(20_000),
      })
      const body = (await response.json()) as SafetyScanResponse
      if (!body || !Array.isArray(body.checks)) {
        throw new Error("Safety check returned an unexpected response.")
      }
      setReport(body)
      if (!body.ok && body.error) setScanError(body.error)
    } catch (error) {
      setScanError(errorMessage(error))
    } finally {
      setScanning(false)
    }
  }

  async function scanAllowances() {
    if (!address) {
      setAllowanceError("Enter a watched address in the top bar before scanning allowances.")
      return
    }
    setScanningAllowances(true)
    setAllowanceError(null)
    setAllowanceScan(null)
    setRevokeError(null)
    setRevokeHash(null)
    try {
      const response = await fetch(`/api/allowances?address=${address}`, {
        signal: AbortSignal.timeout(120_000),
      })
      const body = (await response.json()) as AllowanceScanResponse
      if (!body || !Array.isArray(body.approvals)) {
        throw new Error("Allowance scan returned an unexpected response.")
      }
      setAllowanceScan(body)
      if (!body.ok && body.error) setAllowanceError(body.error)
    } catch (error) {
      setAllowanceError(errorMessage(error))
    } finally {
      setScanningAllowances(false)
    }
  }

  async function revoke(row: ApprovalRow) {
    const key = `${row.chainId}:${row.token}:${row.spender}`
    const nextChainId = appChainId(row.chainId)
    if (!address || !nextChainId || !isAddress(row.token) || !isAddress(row.spender)) {
      setRevokeError("This approval cannot be revoked from the current registry.")
      return
    }
    if (!connector) {
      setRevokeError("No injected wallet is available in this browser.")
      return
    }
    setRevoking(key)
    setRevokeError(null)
    setRevokeHash(null)
    try {
      let account = connection.address
      let currentChain = connection.chainId
      if (!connection.isConnected || !account) {
        const connected = await connectAsync({ connector })
        account = connected.accounts[0]
        currentChain = connected.chainId
      }
      if (!account || getAddress(account) !== address) {
        throw new Error("Connect the watched address. A different wallet cannot clear these allowances.")
      }
      if (currentChain !== nextChainId) {
        await switchChainAsync({ chainId: nextChainId })
      }
      const hash = await writeAsync({
        address: getAddress(row.token),
        abi: erc20Abi,
        functionName: "approve",
        args: [getAddress(row.spender), BigInt(0)],
        chainId: nextChainId,
      })
      setRevokeHash(hash)
    } catch (error) {
      setRevokeError(errorMessage(error))
    } finally {
      setRevoking(null)
    }
  }

  const problemChains =
    allowanceScan?.chains.filter((chain) => chain.error || chain.partial || chain.truncated) ?? []

  return (
    <div>
      <PageHeader
        eyebrow="Risk"
        title="Safety Gate"
        description="Live GoPlus token and claim-link checks, plus open ERC-20 allowances from indexed chains. Warnings do not block the page."
      />

      <p className="mb-4 text-sm text-zinc-400">
        {goplusConfigured
          ? "GoPlus app credentials are set on the server. The browser does not receive them."
          : "GoPlus app credentials are not set. The public endpoint is used."}
      </p>

      <form className="rounded-xl border border-white/10 bg-zinc-900/70 p-4" onSubmit={scanContract}>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <label className="block text-sm text-zinc-300">
            <span className="mb-1.5 block text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
              Network
            </span>
            <select
              value={chainId}
              onChange={(event) => setChainId(event.target.value)}
              className={selectClass}
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
              Contract or claim URL
            </span>
            <Input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="0x… or https://…"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <Button type="submit" disabled={scanning}>
            {scanning ? "Checking…" : "Check"}
          </Button>
        </div>
        {scanError ? <p className="mt-3 text-sm text-rose-300">{scanError}</p> : null}
      </form>

      {report ? (
        <section className="mt-4 rounded-xl border border-white/10 bg-zinc-900/70 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-zinc-100">GoPlus result</h2>
            {report.label && report.level ? (
              <Badge tone={riskTone(report.level)}>{report.label}</Badge>
            ) : (
              <Badge>No risk badge</Badge>
            )}
          </div>
          {report.notice ? <p className="mt-2 text-sm text-zinc-400">{report.notice}</p> : null}
          <ul className="mt-4 space-y-4">
            {report.checks.map((check) => (
              <li key={`${check.kind}:${check.subject}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm break-all text-zinc-200">{check.subject}</p>
                  {check.label && check.level ? (
                    <Badge tone={riskTone(check.level)}>{check.label}</Badge>
                  ) : null}
                </div>
                {check.error ? <p className="mt-1 text-sm text-rose-300">{check.error}</p> : null}
                {check.findings.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                    {check.findings.map((finding) => (
                      <li key={finding}>{finding}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Open allowances</h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              Scans Approval logs for the watched address on each indexed chain, then reads the
              current allowance. Revoke sends approve(spender, 0) from your wallet. Proofit does
              not take custody and never asks for a seed phrase.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void scanAllowances()} disabled={scanningAllowances}>
              {scanningAllowances ? "Scanning…" : "Scan allowances"}
            </Button>
            {revokeHref ? (
              <Button variant="outline" asChild>
                <a href={revokeHref} target="_blank" rel="noreferrer">
                  Open revoke.cash
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <p className="text-sm text-zinc-400">
          {connection.isConnected && connectedAddress
            ? `Connected ${shortenAddress(connectedAddress)}.`
            : "No wallet connected."}
          {sameWallet
            ? " It matches the watched address, so revoke is available."
            : connection.isConnected
              ? " It does not match the watched address, so revoke stays off."
              : " Connect the watched address to revoke."}
        </p>
        {!connection.isConnected ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            disabled={!connector || connecting}
            onClick={() => {
              if (!connector) return
              void connectAsync({ connector }).catch((error: unknown) => {
                setRevokeError(errorMessage(error))
              })
            }}
          >
            {connecting ? "Connecting…" : "Connect wallet"}
          </Button>
        ) : null}
        {revokeError ? <p className="mt-3 text-sm text-rose-300">{revokeError}</p> : null}
        {revokeHash ? (
          <p className="mt-3 font-mono text-xs break-all text-zinc-400">
            Revoke submitted. Transaction {revokeHash}
          </p>
        ) : null}
        {allowanceError ? <p className="mt-3 text-sm text-rose-300">{allowanceError}</p> : null}

        {allowanceScan ? (
          <>
            <p className="mt-4 text-sm text-zinc-500">
              Each chain reads at most the latest {allowanceScan.lookbackBlocks.toLocaleString()} blocks,
              or stops when the RPC time budget ends. Older approvals are not listed here.
            </p>
            {allowanceScan.approvals.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-300">
                No open ERC-20 allowances were found in the scanned block windows.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-950/70 text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
                    <tr>
                      <th className="px-4 py-3 font-medium">Token</th>
                      <th className="px-4 py-3 font-medium">Spender Contract</th>
                      <th className="px-4 py-3 font-medium">Allowance Amount</th>
                      <th className="px-4 py-3 font-medium">Chain</th>
                      <th className="px-4 py-3 font-medium">Revoke</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allowanceScan.approvals.map((row) => {
                      const key = `${row.chainId}:${row.token}:${row.spender}`
                      return (
                        <tr key={key} className="border-t border-white/10 align-top">
                          <td className="px-4 py-3">
                            <p className="text-zinc-100">{row.tokenSymbol ?? "Unknown symbol"}</p>
                            <p className="mt-1 font-mono text-xs break-all text-zinc-500">{row.token}</p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs break-all text-zinc-300">
                            {row.spender}
                          </td>
                          <td className="px-4 py-3 font-mono text-zinc-100">{allowanceLabel(row)}</td>
                          <td className="px-4 py-3 text-zinc-300">{row.chain}</td>
                          <td className="px-4 py-3">
                            <Button
                              type="button"
                              size="sm"
                              disabled={writing || revoking !== null || (connection.isConnected && !sameWallet)}
                              onClick={() => void revoke(row)}
                            >
                              {revoking === key ? "Revoking…" : "Revoke"}
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {problemChains.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-zinc-500">
                {problemChains.map((chain) => (
                  <li key={chain.chainId}>
                    {chain.chain}
                    {chain.fromBlock && chain.toBlock
                      ? ` scanned blocks ${chain.fromBlock}–${chain.toBlock}`
                      : " did not finish a block window"}
                    {chain.partial ? ", before the full lookback" : ""}
                    {chain.truncated ? ", pair list truncated" : ""}
                    {chain.error ? `. ${chain.error}` : "."}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <LegalDisclaimer />
    </div>
  )
}
