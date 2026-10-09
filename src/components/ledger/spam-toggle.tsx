export function SpamToggle({
  checked,
  hiddenCount,
  onChange,
}: {
  checked: boolean
  hiddenCount: number
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-emerald-400"
      />
      <span>Hide Spam & Dust Tokens</span>
      {checked && hiddenCount > 0 ? (
        <span className="text-xs text-zinc-500">{hiddenCount} hidden</span>
      ) : null}
    </label>
  )
}
