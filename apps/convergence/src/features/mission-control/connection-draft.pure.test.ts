import { describe, expect, it } from 'vitest'
import type { SessionRelay } from '@/entities/session-relay'
import {
  CONVERSATION_RESET_COMMAND,
  beforeDeliveryOptions,
  connectionDraftIsDirty,
  connectionDraftProblem,
  customOpenerNote,
  draftFromRelay,
  newConnectionDraft,
  openerForDraft,
  relayInputFromDraft,
} from './connection-draft.pure'

function relay(overrides: Partial<SessionRelay> = {}): SessionRelay {
  return {
    id: 'wire-1',
    crewId: 'c1',
    sourceSessionId: 'fable',
    trigger: 'settled',
    action: 'hail',
    targetSessionId: 'opus',
    spawnSpec: null,
    instruction: null,
    opener: null,
    conditionToken: null,
    armed: true,
    createdAt: '2026-09-06T10:00:00.000Z',
    updatedAt: '2026-09-06T10:00:00.000Z',
    ...overrides,
  }
}

describe('newConnectionDraft', () => {
  it('starts enabled and unconditional, and sends nothing by existing', () => {
    const draft = newConnectionDraft({
      sourceSessionId: 'fable',
      targetSessionId: 'opus',
    })

    expect(draft.enabled).toBe(true)
    expect(draft.condition).toEqual({ kind: 'any' })
    expect(draft.beforeDelivery).toBe('keep')
    expect(openerForDraft(draft)).toBeNull()
  })

  it('pre-fills the condition from the recipient’s baton name', () => {
    const draft = newConnectionDraft({
      sourceSessionId: 'fable',
      targetSessionId: 'opus',
      suggestedBatonName: 'horse',
    })

    expect(draft.condition).toEqual({ kind: 'token', token: 'BATON: horse' })
  })

  it('stays unconditional when the recipient has no baton name', () => {
    // `BATON: ` with nothing after it is a condition that can never match.
    const draft = newConnectionDraft({
      sourceSessionId: 'fable',
      targetSessionId: 'opus',
      suggestedBatonName: null,
    })

    expect(draft.condition).toEqual({ kind: 'any' })
  })
})

describe('draftFromRelay and relayInputFromDraft', () => {
  it('round-trips every capability the retired editor had', () => {
    const stored = relay({
      instruction: 'Implement the brief.',
      opener: 'Read CONTRIBUTING.md first.',
      conditionToken: 'BATON: horse',
      armed: false,
    })

    const draft = draftFromRelay(stored, { supportsReset: true })
    expect(draft).toMatchObject({
      sourceSessionId: 'fable',
      recipient: { kind: 'session', sessionId: 'opus' },
      enabled: false,
      condition: { kind: 'token', token: 'BATON: horse' },
      beforeDelivery: 'custom',
      customOpener: 'Read CONTRIBUTING.md first.',
      instructions: 'Implement the brief.',
    })

    const input = relayInputFromDraft(draft)
    expect(input).toMatchObject({
      action: 'hail',
      targetSessionId: 'opus',
      spawnSpec: null,
      instruction: 'Implement the brief.',
      opener: 'Read CONTRIBUTING.md first.',
      conditionToken: 'BATON: horse',
      armed: false,
    })
  })

  /**
   * R9, and promise 2's hardest half: the spawn path is the capability most
   * easily lost in a redesign, because no frame pictures it.
   *
   * Mutation that reds it: drop `Start a new session…` from the recipient
   * picker, or let `relayInputFromDraft` fall through to `hail`.
   */
  it('still saves a spawn, with its whole spec', () => {
    const stored = relay({
      action: 'spawn',
      targetSessionId: null,
      spawnSpec: {
        projectId: 'p1',
        providerId: 'codex',
        model: 'gpt-6-astra',
        effort: 'high',
        name: 'Reviewer',
        providerAccountId: 'account-2',
      },
    })

    const draft = draftFromRelay(stored, { supportsReset: true })
    expect(draft.recipient).toEqual({
      kind: 'spawn',
      spec: {
        projectId: 'p1',
        providerId: 'codex',
        model: 'gpt-6-astra',
        effort: 'high',
        name: 'Reviewer',
        providerAccountId: 'account-2',
      },
    })

    const input = relayInputFromDraft(draft)
    expect(input.action).toBe('spawn')
    expect(input.targetSessionId).toBeNull()
    expect(input.spawnSpec).toMatchObject({
      providerId: 'codex',
      name: 'Reviewer',
      providerAccountId: 'account-2',
    })
    // A spawn opens a session that has never been used: there is nothing to
    // reset and nothing to say first.
    expect(input.opener).toBeNull()
  })

  it('clears the other arm’s field, so a wire never claims to be both', () => {
    const draft = newConnectionDraft({ sourceSessionId: 'fable' })
    const spawning = relayInputFromDraft({
      ...draft,
      recipient: {
        kind: 'spawn',
        spec: {
          projectId: null,
          providerId: 'codex',
          model: null,
          effort: null,
          name: '',
          providerAccountId: null,
        },
      },
    })

    expect(spawning.targetSessionId).toBeNull()
    // An empty name is not a name: the engine's own default is the honest
    // fallback, not a session called "".
    expect(spawning.spawnSpec?.name).toBe('Relayed session')
  })

  it('sends explicit nulls, so clearing a box actually clears it', () => {
    const draft = draftFromRelay(
      relay({ instruction: 'old', conditionToken: 'BATON: horse' }),
      { supportsReset: true },
    )
    const input = relayInputFromDraft({
      ...draft,
      instructions: '   ',
      condition: { kind: 'any' },
    })

    expect(input.instruction).toBeNull()
    expect(input.conditionToken).toBeNull()
  })
})

describe('the Before delivery selector (R8)', () => {
  /**
   * The compatibility promise: nothing an older build stored is lost or
   * silently reinterpreted into a control that does not work.
   *
   * Mutation that reds it: read a stored `/clear` as `clear` regardless of
   * the provider — the option is then selected but disabled, and the text is
   * gone from the box.
   */
  it('reads a stored /clear as Clear only where the provider can do it', () => {
    const stored = relay({ opener: CONVERSATION_RESET_COMMAND })

    expect(draftFromRelay(stored, { supportsReset: true })).toMatchObject({
      beforeDelivery: 'clear',
      customOpener: '',
    })
    expect(draftFromRelay(stored, { supportsReset: false })).toMatchObject({
      beforeDelivery: 'custom',
      customOpener: CONVERSATION_RESET_COMMAND,
    })
  })

  it('says so when a stored reset lands on a provider that cannot run it', () => {
    const draft = draftFromRelay(
      relay({ opener: CONVERSATION_RESET_COMMAND }),
      {
        supportsReset: false,
      },
    )

    expect(customOpenerNote(draft, false)).toContain(CONVERSATION_RESET_COMMAND)
    expect(customOpenerNote(draft, true)).toBeNull()
  })

  /**
   * Offered DISABLED with its reason rather than hidden: a control that
   * vanishes teaches nothing, and the person is left wondering whether
   * Convergence forgot the feature.
   *
   * Mutation that reds it: filter the unsupported option out of the list.
   */
  it('offers all three choices either way, and disables only what cannot run', () => {
    const supported = beforeDeliveryOptions({
      supportsReset: true,
      providerName: 'Claude Code',
      recipientName: 'Opus',
    })
    const unsupported = beforeDeliveryOptions({
      supportsReset: false,
      providerName: 'Codex',
      recipientName: 'Sol',
    })

    expect(supported.map((option) => option.mode)).toEqual([
      'keep',
      'clear',
      'custom',
    ])
    expect(unsupported.map((option) => option.mode)).toEqual([
      'keep',
      'clear',
      'custom',
    ])
    expect(supported.map((option) => option.disabled)).toEqual([
      false,
      false,
      false,
    ])
    expect(unsupported.map((option) => option.disabled)).toEqual([
      false,
      true,
      false,
    ])
    // The reason names the provider, so it is actionable rather than a shrug.
    expect(unsupported[1].help).toContain('Codex')
    // And the custom first message survives on every provider: R8 keeps the
    // arbitrary opener beside the new selector rather than replacing it.
    expect(unsupported[2].disabled).toBe(false)
  })

  it('stores exactly one thing per choice', () => {
    const base = newConnectionDraft({
      sourceSessionId: 'fable',
      targetSessionId: 'opus',
    })

    expect(openerForDraft({ ...base, beforeDelivery: 'keep' })).toBeNull()
    expect(openerForDraft({ ...base, beforeDelivery: 'clear' })).toBe(
      CONVERSATION_RESET_COMMAND,
    )
    expect(
      openerForDraft({
        ...base,
        beforeDelivery: 'custom',
        customOpener: 'Read this first.',
      }),
    ).toBe('Read this first.')
    // A custom choice with nothing typed is not a first message.
    expect(
      openerForDraft({ ...base, beforeDelivery: 'custom', customOpener: '  ' }),
    ).toBeNull()
  })

  it('keeps the custom text while another choice is selected', () => {
    const base = newConnectionDraft({
      sourceSessionId: 'fable',
      targetSessionId: 'opus',
    })
    const typed = {
      ...base,
      beforeDelivery: 'custom' as const,
      customOpener: 'hi',
    }
    const switched = { ...typed, beforeDelivery: 'keep' as const }

    expect(switched.customOpener).toBe('hi')
    expect(openerForDraft(switched)).toBeNull()
    expect(openerForDraft({ ...switched, beforeDelivery: 'custom' })).toBe('hi')
  })
})

describe('connectionDraftProblem', () => {
  it('refuses a conversation answering itself, ahead of the trip (R6)', () => {
    const draft = newConnectionDraft({
      sourceSessionId: 'fable',
      targetSessionId: 'fable',
    })

    expect(connectionDraftProblem(draft, [], null)).toContain(
      'cannot answer itself',
    )
  })

  it('refuses a second wire on the same pair and condition', () => {
    const existing = relay({ conditionToken: 'BATON: horse' })
    const draft = newConnectionDraft({
      sourceSessionId: 'fable',
      targetSessionId: 'opus',
      suggestedBatonName: 'horse',
    })

    expect(connectionDraftProblem(draft, [existing], null)).toContain(
      'already connected',
    )
    // The wire being edited is not its own duplicate.
    expect(connectionDraftProblem(draft, [existing], existing.id)).toBeNull()
  })

  /**
   * R6: parallel wires between the same pair are ALLOWED when they answer
   * different routes, and the engine evaluates them independently. Refusing
   * them here would forbid a shape the engine supports.
   */
  it('allows a second wire on the same pair with a different condition', () => {
    const existing = relay({ conditionToken: 'BATON: horse' })
    const draft = newConnectionDraft({
      sourceSessionId: 'fable',
      targetSessionId: 'opus',
      suggestedBatonName: 'reviewer',
    })

    expect(connectionDraftProblem(draft, [existing], null)).toBeNull()
  })

  it('asks for the missing half of each shape', () => {
    const empty = newConnectionDraft({ sourceSessionId: 'fable' })
    expect(connectionDraftProblem(empty, [], null)).toContain(
      'should receive the reply',
    )

    expect(
      connectionDraftProblem(
        {
          ...empty,
          recipient: {
            kind: 'spawn',
            spec: {
              projectId: null,
              providerId: null,
              model: null,
              effort: null,
              name: '',
              providerAccountId: null,
            },
          },
        },
        [],
        null,
      ),
    ).toContain('provider')
  })
})

describe('connectionDraftIsDirty', () => {
  it('sees a change the stored shape would hide', () => {
    const saved = draftFromRelay(relay(), { supportsReset: true })
    const typed = { ...saved, customOpener: 'not sent while keeping context' }

    // Both store the same opener (none), so a comparison of stored shapes
    // would call this no change — and the person would lose what they typed.
    expect(openerForDraft(saved)).toBe(openerForDraft(typed))
    expect(connectionDraftIsDirty(typed, saved)).toBe(true)
    expect(connectionDraftIsDirty(saved, saved)).toBe(false)
  })
})
