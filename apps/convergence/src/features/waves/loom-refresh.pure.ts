/**
 * What Loom's Refresh control says (MAR-3227 R6).
 *
 * - `just read` while the floor would refuse a read -- and the control is
 *   then blocked, because pressing would do nothing and nothing must pretend
 *   otherwise.
 * - `never read` when the tracker has not answered once.
 * - `read N s ago` / `N min` / `N h` / `N d` otherwise, counted from the
 *   last successful read.
 *
 * `live` asks for a one-second clock: the label moves every second only
 * while it carries seconds (or waits out the floor); after that a minute
 * clock is enough, and with no age at all there is no clock.
 */
export interface LoomRefreshView {
  label: string
  blocked: boolean
  ticking: boolean
  live: boolean
}

function parsed(at: string | null): number | null {
  if (at === null) return null
  const value = Date.parse(at)
  return Number.isFinite(value) ? value : null
}

function ageWords(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h`
  return `${Math.floor(seconds / 86_400)} d`
}

export function loomRefreshView(input: {
  lastOkAt: string | null
  refreshableAt: string | null
  now: number
}): LoomRefreshView {
  const readAt = parsed(input.lastOkAt)
  const openAt = parsed(input.refreshableAt)
  const blocked = openAt !== null && input.now < openAt
  if (blocked) {
    return { label: 'just read', blocked, ticking: true, live: true }
  }
  if (readAt === null) {
    return { label: 'never read', blocked, ticking: false, live: false }
  }
  const seconds = Math.max(0, Math.floor((input.now - readAt) / 1000))
  return {
    label: `read ${ageWords(seconds)} ago`,
    blocked,
    ticking: true,
    live: seconds < 60,
  }
}

/** The later of two ISO instants; an unparseable one loses. */
export function laterReadAt(a: string | null, b: string | null): string | null {
  const x = parsed(a)
  const y = parsed(b)
  if (x === null) return y === null ? null : b
  if (y === null) return a
  return y > x ? b : a
}
