function cell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function toCsv(header: readonly string[], rows: readonly (readonly string[])[]) {
  const lines = [header, ...rows].map((line) => line.map(cell).join(","))
  return `${lines.join("\r\n")}\r\n`
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
