export interface DispatchOrderKey {
  priority?: number | null
  firstSeenAt?: string | null
  identifier: string
}

/** Shared queue order: priority, earliest dispatch observation, issue number. */
export function dispatchQueueCompare(
  a: DispatchOrderKey,
  b: DispatchOrderKey,
): number {
  const rank = (p: number | null | undefined) => (p == null || p === 0 ? 5 : p)
  const priority = rank(a.priority) - rank(b.priority)
  if (priority !== 0) return priority
  const seen = (a.firstSeenAt ?? '\uffff').localeCompare(
    b.firstSeenAt ?? '\uffff',
  )
  if (seen !== 0) return seen
  const number = (id: string) => {
    const match = /(\d+)$/.exec(id)
    return match ? Number(match[1]) : null
  }
  const an = number(a.identifier),
    bn = number(b.identifier)
  if (an !== null && bn !== null && an !== bn) return an - bn
  if (an === null && bn !== null) return 1
  if (an !== null && bn === null) return -1
  return a.identifier.localeCompare(b.identifier)
}
