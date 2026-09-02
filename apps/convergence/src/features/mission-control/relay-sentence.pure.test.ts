import { describe, expect, it } from 'vitest'
import type { SessionRelay } from '@/entities/session-relay'
import {
  EMPTY_RELAY_DRAFT,
  EMPTY_SPAWN_DRAFT,
  MISSING_SESSION_LABEL,
  RELAY_INSTRUCTION_MARKER,
  RELAY_OPENER_MARKER_LENGTH,
  RELAY_TRIGGER_CLAUSES,
  relayConditionMarker,
  buildRelayEndpointOptions,
  buildRelaySentence,
  formatArmedLabel,
  formatRelayCount,
  isSavableRelayDraft,
  relayDraftProblem,
  relayOpenerMarker,
} from './relay-sentence.pure'
import type { RelayDraft, RelaySpawnDraft } from './relay-sentence.pure'

const NAMES: Record<string, string> = {
  s1: 'Implementor',
  s2: 'Reviewer',
  s3: 'Scribe',
}

const resolveName = (id: string): string | null => NAMES[id] ?? null

function relay(
  overrides: Partial<SessionRelay> & { id: string },
): SessionRelay {
  return {
    crewId: 'c1',
    sourceSessionId: 's1',
    trigger: 'settled',
    action: 'hail',
    targetSessionId: 's2',
    spawnSpec: null,
    instruction: null,
    opener: null,
    conditionToken: null,
    armed: true,
    createdAt: '2026-08-15T10:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
    ...overrides,
  }
}

function hailWire(
  sourceSessionId: string,
  targetSessionId: string | null,
): Pick<
  SessionRelay,
  | 'trigger'
  | 'sourceSessionId'
  | 'targetSessionId'
  | 'action'
  | 'spawnSpec'
  | 'instruction'
  | 'opener'
  | 'conditionToken'
> {
  return {
    trigger: 'settled',
    action: 'hail',
    conditionToken: null,
    sourceSessionId,
    targetSessionId,
    spawnSpec: null,
    instruction: null,
    opener: null,
  }
}

function hailDraft(
  sourceSessionId: string | null,
  targetSessionId: string | null,
): RelayDraft {
  return { ...EMPTY_RELAY_DRAFT, sourceSessionId, targetSessionId }
}

function spawnDraft(overrides: Partial<RelaySpawnDraft> = {}): RelayDraft {
  return {
    ...EMPTY_RELAY_DRAFT,
    action: 'spawn',
    sourceSessionId: 's1',
    spawn: { ...EMPTY_SPAWN_DRAFT, providerId: 'codex', ...overrides },
  }
}

describe('buildRelaySentence', () => {
  it('reads as one honest sentence in the order things happen', () => {
    const sentence = buildRelaySentence(hailWire('s1', 's2'), resolveName)

    expect(sentence.text).toBe(
      'When Implementor finishes, send its last message to Reviewer',
    )
    expect(sentence.source).toEqual({
      sessionId: 's1',
      name: 'Implementor',
      missing: false,
    })
    expect(sentence.target.missing).toBe(false)
  })

  it('says plainly when an end of the wire was deleted', () => {
    const sentence = buildRelaySentence(hailWire('s1', 'gone'), resolveName)

    expect(sentence.target).toEqual({
      sessionId: 'gone',
      name: MISSING_SESSION_LABEL,
      missing: true,
    })
    expect(sentence.text).toContain(MISSING_SESSION_LABEL)
  })

  it('treats a wire with no target at all as a missing end', () => {
    const sentence = buildRelaySentence(hailWire('s1', null), resolveName)

    expect(sentence.target.missing).toBe(true)
  })

  it('reads a spawn as the session it will open, with its specifics', () => {
    const sentence = buildRelaySentence(
      {
        trigger: 'settled',
        action: 'spawn',
        sourceSessionId: 's1',
        targetSessionId: null,
        instruction: null,
        opener: null,
        conditionToken: null,
        spawnSpec: {
          projectId: 'p1',
          providerId: 'codex',
          model: 'gpt-5.6',
          effort: null,
          name: 'Reviewer',
          providerAccountId: null,
        },
      },
      resolveName,
      () => 'Convergence',
    )

    expect(sentence.connector).toBe('start a new session called')
    expect(sentence.target).toEqual({
      sessionId: '',
      name: 'Reviewer',
      missing: false,
    })
    expect(sentence.detail).toBe('codex in Convergence')
    expect(sentence.text).toBe(
      'When Implementor finishes, start a new session called Reviewer — codex in Convergence',
    )
  })

  it('names the account a spawn was explicitly given', () => {
    const sentence = buildRelaySentence(
      {
        trigger: 'settled',
        action: 'spawn',
        sourceSessionId: 's1',
        targetSessionId: null,
        instruction: null,
        opener: null,
        conditionToken: null,
        spawnSpec: {
          projectId: 'p1',
          providerId: 'codex',
          model: null,
          effort: null,
          name: 'Reviewer',
          providerAccountId: 'acct-1',
        },
      },
      resolveName,
      () => 'Convergence',
      () => 'me@proton.me',
    )

    expect(sentence.detail).toBe('codex in Convergence · as me@proton.me')
  })

  /**
   * Null is "the enrolled default when this fires", not a named account, so
   * printing today's default would be a promise the wire has not made.
   */
  it('stays silent about the account when the wire named none', () => {
    const sentence = buildRelaySentence(
      {
        trigger: 'settled',
        action: 'spawn',
        sourceSessionId: 's1',
        targetSessionId: null,
        instruction: null,
        opener: null,
        conditionToken: null,
        spawnSpec: {
          projectId: 'p1',
          providerId: 'codex',
          model: null,
          effort: null,
          name: 'Reviewer',
          providerAccountId: null,
        },
      },
      resolveName,
      () => 'Convergence',
      () => 'me@proton.me',
    )

    expect(sentence.detail).toBe('codex in Convergence')
  })

  it('says an explicitly named account is gone rather than dropping it', () => {
    const sentence = buildRelaySentence(
      {
        trigger: 'settled',
        action: 'spawn',
        sourceSessionId: 's1',
        targetSessionId: null,
        instruction: null,
        opener: null,
        conditionToken: null,
        spawnSpec: {
          projectId: 'p1',
          providerId: 'codex',
          model: null,
          effort: null,
          name: 'Reviewer',
          providerAccountId: 'deleted',
        },
      },
      resolveName,
      () => 'Convergence',
      () => null,
    )

    expect(sentence.detail).toContain('an account that is gone')
  })

  it('says so when a spawn wire lost its spec', () => {
    const sentence = buildRelaySentence(
      {
        trigger: 'settled',
        action: 'spawn',
        sourceSessionId: 's1',
        targetSessionId: null,
        instruction: null,
        opener: null,
        conditionToken: null,
        spawnSpec: null,
      },
      resolveName,
    )

    expect(sentence.target.missing).toBe(true)
    expect(sentence.text).toContain('never described')
  })
})

describe('the trigger clause', () => {
  it('wraps the source session in the words its trigger owns', () => {
    const sentence = buildRelaySentence(hailWire('s1', 's2'), resolveName)

    expect(sentence.trigger).toEqual(RELAY_TRIGGER_CLAUSES.settled)
    expect(sentence.text.startsWith('When Implementor finishes,')).toBe(true)
  })

  /**
   * The clause is a map keyed by the trigger union so a second trigger cannot
   * ship without words. Every reader takes them from here, which is what stops
   * a row from saying "finishes" about a wire that fires on a message.
   */
  it('gives every trigger this build knows a full clause', () => {
    for (const clause of Object.values(RELAY_TRIGGER_CLAUSES)) {
      expect(clause.prefix.length).toBeGreaterThan(0)
      expect(clause.suffix.length).toBeGreaterThan(0)
    }
  })
})

describe('the instruction marker', () => {
  it('says nothing at all when the wire carries no brief', () => {
    const sentence = buildRelaySentence(hailWire('s1', 's2'), resolveName)

    expect(sentence.instruction).toBeNull()
    expect(sentence.text).not.toContain(RELAY_INSTRUCTION_MARKER)
  })

  it('marks a briefed hail quietly and keeps the brief itself', () => {
    // The marker earns its place by being short: a row is scanned, and the
    // brief is one hover or one click away in the form.
    const sentence = buildRelaySentence(
      { ...hailWire('s1', 's2'), instruction: 'Review this and push back.' },
      resolveName,
    )

    expect(sentence.instruction).toBe('Review this and push back.')
    expect(sentence.text).toBe(
      `When Implementor finishes, send its last message to Reviewer · ${RELAY_INSTRUCTION_MARKER}`,
    )
  })

  it('marks a briefed spawn after its specifics', () => {
    const sentence = buildRelaySentence(
      {
        trigger: 'settled',
        action: 'spawn',
        sourceSessionId: 's1',
        targetSessionId: null,
        instruction: 'Start from the branch diff.',
        opener: null,
        conditionToken: null,
        spawnSpec: {
          projectId: 'p1',
          providerId: 'codex',
          model: null,
          effort: null,
          name: 'Reviewer',
          providerAccountId: null,
        },
      },
      resolveName,
      () => 'convergence',
    )

    expect(sentence.instruction).toBe('Start from the branch diff.')
    expect(sentence.text).toContain(`· ${RELAY_INSTRUCTION_MARKER}`)
    expect(sentence.text.endsWith(RELAY_INSTRUCTION_MARKER)).toBe(true)
  })

  it('treats a whitespace-only brief as no brief', () => {
    const sentence = buildRelaySentence(
      { ...hailWire('s1', 's2'), instruction: '   ' },
      resolveName,
    )

    expect(sentence.instruction).toBeNull()
    expect(sentence.text).not.toContain(RELAY_INSTRUCTION_MARKER)
  })
})

describe('the opener marker', () => {
  it('says nothing at all when the wire has no first send', () => {
    const sentence = buildRelaySentence(hailWire('s1', 's2'), resolveName)

    expect(sentence.opener).toBeNull()
    expect(sentence.text).not.toContain('sends')
  })

  it('quotes the literal first send in the sentence', () => {
    // Not "sends something first": which command it is decides whether the
    // target keeps its memory, so the row names it.
    const sentence = buildRelaySentence(
      { ...hailWire('s1', 's2'), opener: '/clear' },
      resolveName,
    )

    expect(sentence.opener).toBe('/clear')
    expect(sentence.text).toBe(
      'When Implementor finishes, send its last message to Reviewer · sends /clear first',
    )
  })

  it('reads both markers in the order the wire does them', () => {
    const sentence = buildRelaySentence(
      {
        ...hailWire('s1', 's2'),
        opener: '/clear',
        instruction: 'Pick up the next task.',
      },
      resolveName,
    )

    expect(sentence.text).toBe(
      `When Implementor finishes, send its last message to Reviewer · sends /clear first · ${RELAY_INSTRUCTION_MARKER}`,
    )
  })

  it('treats a whitespace-only first send as none', () => {
    const sentence = buildRelaySentence(
      { ...hailWire('s1', 's2'), opener: '   ' },
      resolveName,
    )

    expect(sentence.opener).toBeNull()
  })

  /**
   * A spawn opens a session that did not exist a moment ago, so there is
   * nothing for a first send to reset -- and the backend drops it. The
   * sentence must not promise what the wire will not do.
   */
  it('stays silent about an opener a spawn wire is carrying', () => {
    const sentence = buildRelaySentence(
      {
        trigger: 'settled',
        action: 'spawn',
        sourceSessionId: 's1',
        targetSessionId: null,
        instruction: null,
        opener: '/clear',
        conditionToken: null,
        spawnSpec: null,
      },
      resolveName,
    )

    expect(sentence.opener).toBeNull()
    expect(sentence.text).not.toContain('/clear')
  })

  it('shortens a long first send rather than filling the row with it', () => {
    const marker = relayOpenerMarker('x'.repeat(RELAY_OPENER_MARKER_LENGTH + 5))

    expect(marker).toBe(
      `sends ${'x'.repeat(RELAY_OPENER_MARKER_LENGTH - 1)}… first`,
    )
  })

  it('collapses a first send written across lines', () => {
    expect(relayOpenerMarker('/clear\n')).toBe('sends /clear first')
  })
})

describe('buildRelayEndpointOptions', () => {
  it('offers the crew members it can name', () => {
    expect(buildRelayEndpointOptions(['s1', 's2'], resolveName)).toEqual([
      { id: 's1', label: 'Implementor' },
      { id: 's2', label: 'Reviewer' },
    ])
  })

  it('drops members whose session is gone rather than offering a blank row', () => {
    expect(
      buildRelayEndpointOptions(['s1', 'gone', 's3'], resolveName).map(
        (option) => option.id,
      ),
    ).toEqual(['s1', 's3'])
  })

  it('carries a description when one is available', () => {
    expect(
      buildRelayEndpointOptions(['s1'], resolveName, () => 'convergence'),
    ).toEqual([{ id: 's1', label: 'Implementor', description: 'convergence' }])
  })

  it('omits an empty description instead of rendering a blank line', () => {
    expect(
      buildRelayEndpointOptions(['s1'], resolveName, () => undefined),
    ).toEqual([{ id: 's1', label: 'Implementor' }])
  })
})

describe('relayDraftProblem', () => {
  const existing = [
    relay({ id: 'r1', sourceSessionId: 's1', targetSessionId: 's2' }),
  ]

  it('asks for each end in the order the sentence reads', () => {
    expect(relayDraftProblem(hailDraft(null, null), [])).toBe(
      'Pick the session that finishes.',
    )
    expect(relayDraftProblem(hailDraft('s1', null), [])).toBe(
      'Pick the session that receives its last message.',
    )
  })

  it('refuses a wire pointing at its own source', () => {
    expect(relayDraftProblem(hailDraft('s1', 's1'), [])).toBe(
      'A relay cannot hail the session it listens to.',
    )
  })

  it('refuses a duplicate of a wire the crew already has', () => {
    expect(relayDraftProblem(hailDraft('s1', 's2'), existing)).toBe(
      'This crew already has that wire.',
    )
  })

  it('lets a wire being edited keep its own endpoints', () => {
    expect(relayDraftProblem(hailDraft('s1', 's2'), existing, 'r1')).toBeNull()
  })

  it('asks a spawn for a provider rather than a target', () => {
    expect(
      relayDraftProblem(
        { ...spawnDraft(), spawn: { ...EMPTY_SPAWN_DRAFT } },
        [],
      ),
    ).toBe('Pick the provider for the new session.')
    expect(relayDraftProblem(spawnDraft(), [])).toBeNull()
  })

  it('refuses a second spawn opening the same thing from the same session', () => {
    const spawner: SessionRelay = {
      ...relay({ id: 'r-spawn' }),
      action: 'spawn',
      targetSessionId: null,
      conditionToken: null,
      spawnSpec: {
        projectId: null,
        providerId: 'codex',
        model: null,
        effort: null,
        name: 'Reviewer',
        providerAccountId: null,
      },
    }

    expect(relayDraftProblem(spawnDraft(), [spawner])).toBe(
      'This crew already starts that session here.',
    )
    // A different provider off the same session is a different intention.
    expect(
      relayDraftProblem(spawnDraft({ providerId: 'claude-code' }), [spawner]),
    ).toBeNull()
  })

  it('allows the reverse wire, because loops are legal', () => {
    expect(relayDraftProblem(hailDraft('s2', 's1'), existing)).toBeNull()
  })
})

describe('isSavableRelayDraft', () => {
  it('agrees with the problem it reports', () => {
    expect(isSavableRelayDraft(hailDraft('s1', 's2'), [])).toBe(true)
    expect(isSavableRelayDraft(hailDraft('s1', 's1'), [])).toBe(false)
  })
})

describe('labels', () => {
  it('counts relays in plain words', () => {
    expect(formatRelayCount(0)).toBe('0 relays')
    expect(formatRelayCount(1)).toBe('1 relay')
    expect(formatRelayCount(4)).toBe('4 relays')
  })

  it('names the two states of the switch', () => {
    expect(formatArmedLabel(true)).toBe('Armed')
    expect(formatArmedLabel(false)).toBe('Disarmed')
  })
})

describe('the baton condition in a wire sentence (MAR-2759)', () => {
  it('says what the wire waits for, before it says when it fires', () => {
    const sentence = buildRelaySentence(
      relay({ id: 'r1', conditionToken: 'BATON: horse' }),
      resolveName,
    )

    expect(sentence.condition).toBe('BATON: horse')
    expect(sentence.text).toBe(
      'Only if it ends with "BATON: horse", when Implementor finishes, send its last message to Reviewer',
    )
  })

  it('reads exactly as it always did when the wire waits for nothing', () => {
    const sentence = buildRelaySentence(relay({ id: 'r1' }), resolveName)

    expect(sentence.condition).toBeNull()
    expect(sentence.text).toBe(
      'When Implementor finishes, send its last message to Reviewer',
    )
  })

  it('says it on a spawn too, because a spawn waits the same way', () => {
    const sentence = buildRelaySentence(
      relay({
        id: 'r1',
        action: 'spawn',
        targetSessionId: null,
        conditionToken: 'BATON: reviewer',
        spawnSpec: {
          projectId: 'p1',
          providerId: 'codex',
          model: null,
          effort: null,
          name: 'Reviewer',
          providerAccountId: null,
        },
      }),
      resolveName,
    )

    expect(sentence.condition).toBe('BATON: reviewer')
    expect(sentence.text).toContain('Only if it ends with "BATON: reviewer"')
  })

  it('treats a whitespace-only token as no condition at all', () => {
    expect(
      buildRelaySentence(
        relay({ id: 'r1', conditionToken: '   ' }),
        resolveName,
      ).condition,
    ).toBeNull()
  })

  it('writes the marker with the token quoted exactly as stored', () => {
    // The token IS the line the agent writes. Paraphrasing it in the sentence
    // would hide the one string that actually has to match.
    expect(relayConditionMarker('  BATON: horse  ')).toBe(
      'Only if it ends with "BATON: horse", ',
    )
  })
})
