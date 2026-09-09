import type {
  HarnessEvent,
  HarnessTurn,
  HarnessTurnFacts,
  SessionHarnessFacts,
} from '../../../src/shared/types/harness-facts.types'

/** Fold recorded evidence only; resolution is the emitter's witnessed fact. */
export function foldHarnessFacts(
  events: HarnessEvent[],
  turns: HarnessTurn[],
): SessionHarnessFacts {
  const result: SessionHarnessFacts = {
    turns: [],
    currentTurn: null,
    compactions: [],
    rateLimit: null,
    init: null,
  }
  const byTurn = new Map<string, HarnessTurnFacts>()
  for (const turn of turns) {
    const value: HarnessTurnFacts = {
      turnId: turn.id,
      hooks: [],
      retries: null,
      denials: null,
    }
    result.turns.push(value)
    byTurn.set(turn.id, value)
  }
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const fact = event.fact
    const current = event.turnId ? byTurn.get(event.turnId) : undefined
    if (fact.kind === 'process.ended') {
      for (const value of byTurn.values())
        if (value.retries?.last.phase === 'attempt')
          value.retries.state = 'unknown'
      continue
    }
    if (fact.kind === 'harness.init') result.init = fact
    if (fact.kind === 'harness.rateLimit') result.rateLimit = fact
    if (fact.kind === 'harness.compaction')
      result.compactions.push({ ...fact, sequence: event.sequence })
    if (!current) continue
    if (fact.kind === 'harness.retry') {
      current.retries = {
        attempts:
          fact.phase === 'attempt'
            ? (current.retries?.attempts ?? 0) + 1
            : (current.retries?.attempts ??
              (fact.phase === 'resolved' ? fact.attempts : 0)),
        state:
          fact.phase === 'attempt'
            ? 'in-flight'
            : fact.phase === 'resolved'
              ? fact.outcome
              : 'unknown',
        last: fact,
      }
    }
    if (fact.kind === 'harness.denial')
      (current.denials ??= []).push({
        toolName: fact.toolName,
        ...(fact.toolUseId ? { toolUseId: fact.toolUseId } : {}),
        reasonType: fact.reasonType,
        reason: fact.reason,
        at: fact.at,
        ...(fact.truncated ? { truncated: true as const } : {}),
      })
    if (fact.kind === 'harness.hook') {
      const id = fact.hookId ?? `unidentified-${event.sequence}`
      let hook = current.hooks.find((h) => h.id === id)
      if (!hook) {
        hook = {
          id,
          name: fact.hookName,
          event: fact.hookEvent,
          status: fact.phase === 'unknown' ? 'unknown' : 'running',
          ...(fact.truncated ? { truncated: true as const } : {}),
          startedAt: null,
          durationMs: null,
          output: null,
        }
        current.hooks.push(hook)
      }
      hook.name = fact.hookName ?? hook.name
      hook.event = fact.hookEvent ?? hook.event
      if (fact.phase === 'started') hook.startedAt = fact.at
      if (fact.output !== null) hook.output = fact.output
      if (fact.phase === 'response') {
        hook.status = fact.status ?? 'unknown'
        const duration = hook.startedAt
          ? Date.parse(fact.at) - Date.parse(hook.startedAt)
          : NaN
        hook.durationMs =
          Number.isFinite(duration) && duration >= 0 ? duration : null
      }
    }
  }
  for (const turn of turns) {
    const value = byTurn.get(turn.id)!
    if (value.retries?.last.phase === 'attempt' && turn.status !== 'running')
      value.retries.state = 'unknown'
    if (Array.isArray(turn.permissionDenials)) {
      const early = value.denials ?? []
      const used = new Set<number>()
      value.denials = turn.permissionDenials.map((raw) => {
        const entry =
          raw !== null && typeof raw === 'object'
            ? (raw as Record<string, unknown>)
            : {}
        const toolName =
          typeof entry.tool_name === 'string' ? entry.tool_name : null
        const toolUseId =
          typeof entry.tool_use_id === 'string' ? entry.tool_use_id : null
        let index = toolUseId
          ? early.findIndex((d, i) => !used.has(i) && d.toolUseId === toolUseId)
          : -1
        if (index < 0)
          index = early.findIndex(
            (d, i) =>
              !used.has(i) &&
              d.toolName === toolName &&
              (!toolUseId || !d.toolUseId),
          )
        if (index >= 0) used.add(index)
        const match = early[index]
        return {
          ...(match ?? { toolName, reasonType: null, reason: null, at: null }),
          ...(toolUseId ? { toolUseId } : {}),
        }
      })
    }
  }
  result.currentTurn = result.turns.at(-1) ?? null
  return result
}
