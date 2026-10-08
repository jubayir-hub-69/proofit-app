import Link from "next/link"

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <p className="text-[11px] font-medium tracking-[0.16em] text-zinc-500 uppercase">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">
        That page is not on the desk
      </h1>
      <p className="mt-2 text-sm text-zinc-400">
        The route does not exist. Head back to the dashboard.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-9 items-center rounded-lg bg-emerald-400 px-3.5 text-sm font-medium text-zinc-950 hover:bg-emerald-300"
      >
        Dashboard
      </Link>
    </div>
  )
}
