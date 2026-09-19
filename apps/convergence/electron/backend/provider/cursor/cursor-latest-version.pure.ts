function parseCursorVersion(value: string | null) {
  const match = value
    ?.trim()
    .match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})-([a-f0-9]+)$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]!)
    return null
  return {
    version: match[0],
    date: year * 10000 + month * 100 + day,
    hash: match[4],
  }
}

export function normalizeCursorVersion(value: string | null): string | null {
  return parseCursorVersion(value)?.version ?? null
}

export function parseCursorLatestVersion(script: string): string | null {
  const matches = [
    ...script.matchAll(
      /^DOWNLOAD_URL="https:\/\/downloads\.cursor\.com\/lab\/(\d{4}\.\d{2}\.\d{2}-[a-f0-9]+)\/\$\{OS\}\/\$\{ARCH\}\/agent-cli-package\.tar\.gz"\r?$/gm,
    ),
  ]
  if (matches.length !== 1) return null
  return normalizeCursorVersion(matches[0]![1]!)
}

export function compareCursorVersions(
  left: string,
  right: string,
): number | null {
  const a = parseCursorVersion(left)
  const b = parseCursorVersion(right)
  if (!a || !b) return null
  if (a.date !== b.date) return a.date - b.date
  return a.hash === b.hash ? 0 : null
}
