import type { SessionHarnessFacts } from '../../shared/types/harness-facts.types'
export function harnessPill(facts: SessionHarnessFacts | null): {
  label: string
  alert: boolean
  reason: string | null
} {
  const current = facts?.currentTurn
  const retry = current?.retries
  const servers = facts?.init?.mcpServers
  const needsAuth =
    servers?.others.filter((server) => server.status === 'needs-auth').length ??
    0
  const failed =
    servers?.others.filter((server) => server.status === 'failed').length ?? 0
  const omitted = servers?.omittedAlerts ?? 0
  const reasons: string[] = []
  if (needsAuth)
    reasons.push(
      `${needsAuth} integration${needsAuth === 1 ? ' needs' : 's need'} sign-in`,
    )
  if (failed)
    reasons.push(`${failed} integration${failed === 1 ? '' : 's'} failed`)
  // Omitted alerts carry a count, but no status breakdown. Do not guess it.
  if (omitted)
    reasons.push(
      `${omitted} more integration${omitted === 1 ? ' needs' : 's need'} attention`,
    )
  if (retry?.state === 'in-flight') reasons.push('retrying')
  const reason = reasons.length ? reasons.join(' · ') : null
  const parts = ['Harness']
  if (reason) parts.push(reason)
  if (current?.hooks.length) parts.push(`hooks ${current.hooks.length}`)
  if (retry && retry.state !== 'in-flight')
    parts.push(
      retry.state === 'failed'
        ? 'retry failed'
        : retry.state === 'unknown'
          ? 'retry ?'
          : `retry ${retry.attempts}`,
    )
  if (current?.denials?.length) parts.push(`denied ${current.denials.length}`)
  return { label: parts.join(' · '), alert: reason !== null, reason }
}
export function compactionLabel(
  fact: SessionHarnessFacts['compactions'][number],
): string {
  const format = (n: number) =>
    new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1,
    })
      .format(n)
      .toLowerCase()
  const counts =
    fact.preTokens !== null && fact.postTokens !== null
      ? ` · ${format(fact.preTokens)} → ${format(fact.postTokens)} tokens`
      : fact.preTokens !== null
        ? ` · ${format(fact.preTokens)} tokens before`
        : ''
  return `Compacted (${fact.trigger ?? 'not reported'})${counts}${fact.truncated ? ' · record truncated' : ''}${fact.fieldBounds ? ' · text truncated' : ''}`
}

export function placeCompactions(
  items: readonly { id: string; createdAt: string }[],
  compactions: SessionHarnessFacts['compactions'],
  windowStartedAt?: string,
) {
  const before = new Map<string, SessionHarnessFacts['compactions']>(),
    tail: SessionHarnessFacts['compactions'] = []
  const byTime = [...items].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )
  for (const fact of [...compactions].sort(
    (a, b) => a.at.localeCompare(b.at) || a.sequence - b.sequence,
  )) {
    // A compaction before a partial window is not attached to its first row.
    if (windowStartedAt !== undefined && fact.at < windowStartedAt) continue
    const next = byTime.find((item) => item.createdAt >= fact.at)
    if (next) before.set(next.id, [...(before.get(next.id) ?? []), fact])
    else tail.push(fact)
  }
  return { before, tail }
}

export function isMcpAlertStatus(status: string | null): boolean {
  return status === 'failed' || status === 'needs-auth'
}
