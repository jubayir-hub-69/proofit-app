import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "Settings",
}

const publicKeys = [
  {
    name: "NEXT_PUBLIC_ALCHEMY_KEY",
    configured: Boolean(process.env.NEXT_PUBLIC_ALCHEMY_KEY),
    note: "Optional hosted RPC. Empty uses the public chain endpoints.",
  },
  {
    name: "NEXT_PUBLIC_COVALENT_API_KEY",
    configured: Boolean(process.env.NEXT_PUBLIC_COVALENT_API_KEY),
    note: "GoldRush history for POST /api/wallets/sync. Empty uses Alchemy, then public RPC logs.",
  },
  {
    name: "NEXT_PUBLIC_GOPLUS_API_KEY",
    configured: Boolean(process.env.NEXT_PUBLIC_GOPLUS_API_KEY),
    note: "GoPlus access token for Safety Gate.",
  },
] as const

const serverKeys = [
  {
    name: "TELEGRAM_BOT_TOKEN",
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    note: "Server-only. Used later for alerts. The value is never sent to the browser.",
  },
  {
    name: "DATABASE_URL",
    configured: Boolean(process.env.DATABASE_URL),
    note: "Server-only Postgres URL. The table DDL is supabase/schema.sql.",
  },
  {
    name: "SUPABASE_URL",
    configured: Boolean(process.env.SUPABASE_URL),
    note: "Server-only project URL for the ledger store.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    note: "Server-only. Never prefix with NEXT_PUBLIC_.",
  },
] as const

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Config"
        title="Settings"
        description="Key presence only. Values stay in the environment and are not rendered."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-100">Public</h2>
        <ul className="space-y-2">
          {publicKeys.map((key) => (
            <li
              key={key.name}
              className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <code className="text-sm text-zinc-100">{key.name}</code>
                <Badge tone={key.configured ? "positive" : "neutral"}>
                  {key.configured ? "Set" : "Missing"}
                </Badge>
              </div>
              <p className="mt-1.5 text-sm text-zinc-400">{key.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-medium text-zinc-100">Server</h2>
        <ul className="space-y-2">
          {serverKeys.map((key) => (
            <li
              key={key.name}
              className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <code className="text-sm text-zinc-100">{key.name}</code>
                <Badge tone={key.configured ? "positive" : "neutral"}>
                  {key.configured ? "Set" : "Missing"}
                </Badge>
              </div>
              <p className="mt-1.5 text-sm text-zinc-400">{key.note}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
