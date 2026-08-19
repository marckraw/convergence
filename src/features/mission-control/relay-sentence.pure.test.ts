import { describe, expect, it } from 'vitest'
import type { SessionRelay } from '@/entities/session-relay'
import {
  EMPTY_RELAY_DRAFT,
  EMPTY_SPAWN_DRAFT,
  MISSING_SESSION_LABEL,
  buildRelayEndpointOptions,
  buildRelaySentence,
  formatArmedLabel,
  formatRelayCount,
  isSavableRelayDraft,
  relayDraftProblem,
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
  'sourceSessionId' | 'targetSessionId' | 'action' | 'spawnSpec'
> {
  return {
    action: 'hail',
    sourceSessionId,
    targetSessionId,
    spawnSpec: null,
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
        action: 'spawn',
        sourceSessionId: 's1',
        targetSessionId: null,
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
        action: 'spawn',
        sourceSessionId: 's1',
        targetSessionId: null,
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
        action: 'spawn',
        sourceSessionId: 's1',
        targetSessionId: null,
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
        action: 'spawn',
        sourceSessionId: 's1',
        targetSessionId: null,
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
        action: 'spawn',
        sourceSessionId: 's1',
        targetSessionId: null,
        spawnSpec: null,
      },
      resolveName,
    )

    expect(sentence.target.missing).toBe(true)
    expect(sentence.text).toContain('never described')
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
