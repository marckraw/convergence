import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
export function harnessPill(facts: SessionHarnessFacts | null): {
  label: string
  alert: boolean
} {
  const current = facts?.currentTurn
  const parts = ['Harness']
  if (current?.hooks.length) parts.push(`hooks ${current.hooks.length}`)
  const retry = current?.retries
  if (retry)
    parts.push(
      retry.state === 'failed'
        ? 'retry failed'
        : retry.state === 'unknown'
          ? 'retry ?'
          : `retry ${retry.attempts}`,
    )
  if (current?.denials?.length) parts.push(`denied ${current.denials.length}`)
  if (facts?.compactions.length) parts.push('compacted')
  return {
    label: parts.join(' · '),
    alert:
      retry?.state === 'in-flight' ||
      !!facts?.init?.mcpServers?.some(
        (server) => server.status !== null && server.status !== 'connected',
      ),
  }
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
  return `Compacted (${fact.trigger ?? 'not reported'})${counts}`
}

export function placeCompactions(
  items: readonly { id: string; createdAt: string }[],
  compactions: SessionHarnessFacts['compactions'],
) {
  const before = new Map<string, SessionHarnessFacts['compactions']>(),
    tail: SessionHarnessFacts['compactions'] = []
  for (const fact of [...compactions].sort(
    (a, b) => a.at.localeCompare(b.at) || a.sequence - b.sequence,
  )) {
    const next = items.find((item) => item.createdAt >= fact.at)
    if (next) before.set(next.id, [...(before.get(next.id) ?? []), fact])
    else tail.push(fact)
  }
  return { before, tail }
}
