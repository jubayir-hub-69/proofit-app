"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useSyncExternalStore } from "react"
import { SYNC_CHAINS } from "@/lib/indexer/chains"

export interface SyncStatus {
  address: string | null
  pending: boolean
  settled: boolean
  error: string | null
  imported: number | null
  warnings: string[]
  errors: string[]
}

const serverStatus: SyncStatus = {
  address: null,
  pending: false,
  settled: false,
  error: null,
  imported: null,
  warnings: [],
  errors: [],
}

let status: SyncStatus = serverStatus
const listeners = new Set<() => void>()
const inflight = new Map<string, Promise<void>>()

function emit(next: SyncStatus) {
  status = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSyncStatus() {
  return useSyncExternalStore(subscribe, () => status, () => serverStatus)
}

export function useWalletSync() {
  const queryClient = useQueryClient()
  const current = useSyncStatus()

  const sync = useCallback(
    (address: `0x${string}`) => {
      const existing = inflight.get(address)
      if (existing) return existing
      const run = (async () => {
        emit({
          address,
          pending: true,
          settled: false,
          error: null,
          imported: null,
          warnings: [],
          errors: [],
        })
        try {
          const response = await fetch("/api/wallets/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address,
              chains: SYNC_CHAINS.map((chain) => chain.id),
            }),
          })
          let body: {
            ok?: boolean
            error?: string
            imported?: number
            warnings?: string[]
            errors?: { message?: string }[]
          } = {}
          try {
            body = (await response.json()) as typeof body
          } catch {
            body = {}
          }
          if (response.status === 400) {
            throw new Error(body.error || "Enter a valid EVM address.")
          }
          await queryClient.invalidateQueries({ queryKey: ["ledger", address] })
          const imported = body.ok === false ? 0 : (body.imported ?? 0)
          emit({
            address,
            pending: false,
            settled: true,
            error: null,
            imported,
            warnings: Array.isArray(body.warnings) ? body.warnings : [],
            errors:
              body.ok === false
                ? []
                : Array.isArray(body.errors)
                  ? body.errors.flatMap((item) => (item.message ? [item.message] : []))
                  : [],
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : ""
          const inputError = /address|chain|json|body must/i.test(message)
          if (!inputError) {
            await queryClient.invalidateQueries({ queryKey: ["ledger", address] })
          }
          emit({
            address,
            pending: false,
            settled: true,
            error: inputError ? message : null,
            imported: inputError ? null : 0,
            warnings: [],
            errors: [],
          })
        } finally {
          inflight.delete(address)
        }
      })()
      inflight.set(address, run)
      return run
    },
    [queryClient],
  )

  return { status: current, sync }
}
