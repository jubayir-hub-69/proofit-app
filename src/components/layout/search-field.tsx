"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { buildSearchIndex, searchDesk } from "@/lib/search"

export function SearchField({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter()
  const hits = useMemo(() => buildSearchIndex(), [])
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const results = searchDesk(query, hits)

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <label className="sr-only" htmlFor="desk-search">
        Search the desk
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500"
        aria-hidden
      />
      <Input
        id="desk-search"
        value={query}
        placeholder="Search campaigns, ledger, pages"
        className="pl-9"
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false)
            return
          }
          if (event.key === "Enter" && results[0]) {
            event.preventDefault()
            const href = results[0].href
            setOpen(false)
            setQuery("")
            onNavigate()
            router.push(href)
          }
        }}
      />
      {open && query.trim() ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-white/10 bg-zinc-950 shadow-2xl">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-zinc-500">
              No matches.
            </p>
          ) : (
            <ul>
              {results.map((result) => (
                <li key={result.id}>
                  <Link
                    href={result.href}
                    onClick={() => {
                      setOpen(false)
                      setQuery("")
                      onNavigate()
                    }}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-white/5"
                  >
                    <span className="truncate text-zinc-100">{result.label}</span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {result.hint}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
