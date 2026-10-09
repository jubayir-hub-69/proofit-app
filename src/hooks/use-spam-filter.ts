"use client"

import { useSyncExternalStore } from "react"

let hideSpam = true
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot() {
  return hideSpam
}

export function useHideSpam() {
  const hide = useSyncExternalStore(subscribe, snapshot, () => true)
  function setHide(value: boolean) {
    hideSpam = value
    for (const listener of listeners) listener()
  }
  return [hide, setHide] as const
}
