"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { getAddress, isAddress } from "viem"

const STORAGE_KEY = "proofit.watchAddress"

let memory = ""
let loaded = false
const listeners = new Set<() => void>()

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return
  memory = window.localStorage.getItem(STORAGE_KEY) ?? ""
  loaded = true
}

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  ensureLoaded()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  ensureLoaded()
  return memory
}

function getServerSnapshot() {
  return ""
}

function writeWatchInput(value: string) {
  memory = value
  loaded = true
  if (typeof window !== "undefined") {
    const trimmed = value.trim()
    if (trimmed) window.localStorage.setItem(STORAGE_KEY, trimmed)
    else window.localStorage.removeItem(STORAGE_KEY)
  }
  emit()
}

/**
 * Read-only watch address. The value is a public address stored in
 * localStorage. Proofit never asks for a signature or a private key.
 */
export function useWatchAddress() {
  const input = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setInput = useCallback((value: string) => {
    writeWatchInput(value)
  }, [])

  return useMemo(() => {
    const trimmed = input.trim()
    const address = isAddress(trimmed) ? getAddress(trimmed) : undefined
    return {
      input,
      setInput,
      address,
      isValid: Boolean(address),
    }
  }, [input, setInput])
}
