import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPAWN_NAME,
  MAX_AUTOMATIC_HOPS_PER_FLOW_RUN,
  RELAY_PAYLOAD_PREVIEW_LENGTH,
  assertRelayEndpoints,
  normalizeRelaySpawnSpec,
  buildPayloadPreview,
  flowRunBudgetMessage,
  hasFlowRunBudget,
  isBudgetedOutcome,
  normalizeRelayAction,
  normalizeRelayCrewId,
  normalizeRelaySessionId,
  normalizeRelayTrigger,
} from './relay.pure'

describe('normalizeRelayTrigger', () => {
  it('accepts the one trigger v1 ships', () => {
    expect(normalizeRelayTrigger('settled')).toBe('settled')
  })

  it('rejects anything else', () => {
    expect(() => normalizeRelayTrigger('scheduled')).toThrow(
      'Unknown relay trigger: scheduled',
    )
  })
})

describe('normalizeRelayAction', () => {
  it('accepts both v1 actions', () => {
    expect(normalizeRelayAction('hail')).toBe('hail')
    expect(normalizeRelayAction('spawn')).toBe('spawn')
  })

  it('rejects anything else', () => {
    expect(() => normalizeRelayAction('broadcast')).toThrow(
      'Unknown relay action: broadcast',
    )
  })
})

describe('normalizeRelaySpawnSpec', () => {
  const spec = {
    projectId: ' p1 ',
    providerId: ' codex ',
    model: ' gpt-5.6 ',
    effort: ' high ',
    name: '  Reviewer  ',
    providerAccountId: ' acct-1 ',
  }

  it('trims every field the user could have padded', () => {
    expect(normalizeRelaySpawnSpec(spec)).toEqual({
      projectId: 'p1',
      providerId: 'codex',
      model: 'gpt-5.6',
      effort: 'high',
      name: 'Reviewer',
      providerAccountId: 'acct-1',
    })
  })

  it('reads a spec that names no account as "use the default at firing time"', () => {
    expect(
      normalizeRelaySpawnSpec({ providerId: 'codex', name: 'Reviewer' })
        .providerAccountId,
    ).toBeNull()

    // Blank is the same as absent: the form sends '' when nothing is picked.
    expect(
      normalizeRelaySpawnSpec({
        providerId: 'codex',
        name: 'Reviewer',
        providerAccountId: '   ',
      }).providerAccountId,
    ).toBeNull()
  })

  it('treats a blank project as a global session', () => {
    expect(normalizeRelaySpawnSpec({ ...spec, projectId: '  ' })).toMatchObject(
      { projectId: null },
    )
  })

  it('falls back to a default name rather than an unnamed session', () => {
    expect(normalizeRelaySpawnSpec({ ...spec, name: '' })).toMatchObject({
      name: DEFAULT_SPAWN_NAME,
    })
  })

  it('leaves model and effort unset when the wire did not choose', () => {
    expect(
      normalizeRelaySpawnSpec({ ...spec, model: null, effort: null }),
    ).toMatchObject({ model: null, effort: null })
  })

  it('refuses a spawn with nothing to run it', () => {
    expect(() => normalizeRelaySpawnSpec(null)).toThrow(
      'A spawn relay needs a session spec',
    )
    expect(() =>
      normalizeRelaySpawnSpec({ ...spec, providerId: '   ' }),
    ).toThrow('A spawn relay needs a provider')
  })

  it('refuses a name too long to belong on a card', () => {
    expect(() =>
      normalizeRelaySpawnSpec({ ...spec, name: 'x'.repeat(200) }),
    ).toThrow(/cannot be longer than/)
  })
})

describe('normalizeRelaySessionId', () => {
  it('trims', () => {
    expect(normalizeRelaySessionId('  s1  ', 'source session')).toBe('s1')
  })

  it('names the end that was left blank', () => {
    expect(() => normalizeRelaySessionId('   ', 'target session')).toThrow(
      'Relay target session cannot be empty',
    )
  })
})

describe('normalizeRelayCrewId', () => {
  it('rejects a wire with no crew to live in', () => {
    expect(() => normalizeRelayCrewId(' ')).toThrow(
      'Relay crew cannot be empty',
    )
  })
})

describe('assertRelayEndpoints', () => {
  it('accepts a hail between two different sessions', () => {
    expect(() => assertRelayEndpoints('s1', 's2', 'hail')).not.toThrow()
  })

  it('rejects a hail with no target', () => {
    expect(() => assertRelayEndpoints('s1', null, 'hail')).toThrow(
      'A hail relay needs a target session',
    )
  })

  it('rejects a wire pointing at its own source', () => {
    expect(() => assertRelayEndpoints('s1', 's1', 'hail')).toThrow(
      'A relay cannot hail the session it listens to',
    )
  })

  it('accepts a spawn with no target, since it opens its own', () => {
    expect(() => assertRelayEndpoints('s1', null, 'spawn')).not.toThrow()
  })

  it('rejects a spawn that also names a target', () => {
    expect(() => assertRelayEndpoints('s1', 's2', 'spawn')).toThrow(
      'A spawn relay cannot also have a target session',
    )
  })
})

describe('buildPayloadPreview', () => {
  it('collapses whitespace into one readable line', () => {
    expect(buildPayloadPreview('Done.\n\n  Ready   for review.')).toBe(
      'Done. Ready for review.',
    )
  })

  it('truncates long payloads with an ellipsis', () => {
    const preview = buildPayloadPreview('x'.repeat(2000))
    expect(preview).toHaveLength(RELAY_PAYLOAD_PREVIEW_LENGTH)
    expect(preview?.endsWith('…')).toBe(true)
  })

  it('leaves a payload at the limit untouched', () => {
    const exact = 'y'.repeat(RELAY_PAYLOAD_PREVIEW_LENGTH)
    expect(buildPayloadPreview(exact)).toBe(exact)
  })

  it('treats nothing and whitespace as nothing to preview', () => {
    expect(buildPayloadPreview(null)).toBeNull()
    expect(buildPayloadPreview('   \n ')).toBeNull()
  })
})

describe('isBudgetedOutcome', () => {
  it('counts hops that spent a provider turn', () => {
    expect(isBudgetedOutcome('delivered')).toBe(true)
    expect(isBudgetedOutcome('queued')).toBe(true)
    expect(isBudgetedOutcome('spawned')).toBe(true)
  })

  it('does not charge the budget for skips or errors', () => {
    expect(isBudgetedOutcome('skipped-failed')).toBe(false)
    // A word from another build is not evidence a provider turn was spent.
    expect(isBudgetedOutcome('skipped-disarmed')).toBe(false)
    expect(isBudgetedOutcome('skipped-budget')).toBe(false)
    expect(isBudgetedOutcome('error')).toBe(false)
  })
})

describe('hasFlowRunBudget', () => {
  it('allows hops up to the budget and stops at it', () => {
    expect(hasFlowRunBudget(0)).toBe(true)
    expect(hasFlowRunBudget(MAX_AUTOMATIC_HOPS_PER_FLOW_RUN - 1)).toBe(true)
    expect(hasFlowRunBudget(MAX_AUTOMATIC_HOPS_PER_FLOW_RUN)).toBe(false)
  })
})

describe('flowRunBudgetMessage', () => {
  it('names the numbers so the disarm never looks arbitrary', () => {
    const message = flowRunBudgetMessage(MAX_AUTOMATIC_HOPS_PER_FLOW_RUN)
    expect(message).toContain(String(MAX_AUTOMATIC_HOPS_PER_FLOW_RUN))
    expect(message).toContain('disarmed')
  })
})
