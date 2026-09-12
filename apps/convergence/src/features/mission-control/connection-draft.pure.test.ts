import { REMOTE_SPAWN_PLACE_REQUIRED } from '../../../electron/backend/relay/relay.pure'
import {
  buildFallbackCodexDescriptor,
  buildFallbackPiDescriptor,
} from '../../../electron/backend/provider/provider-descriptor.pure'
import { describe, expect, it } from 'vitest'
import type { SessionRelay } from '@/entities/session-relay'
import {
  EMPTY_SPAWN_SPEC,
  CONVERSATION_RESET_COMMAND,
  beforeDeliveryOptions,
  connectionDraftIsDirty,
  changeDraftRecipient,
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
  it('starts Off and unconditional (mutation: enable new drafts)', () => {
    const draft = newConnectionDraft({
      sourceSessionId: 'fable',
      targetSessionId: 'opus',
    })

    expect(draft.enabled).toBe(false)
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
        executionHost: 'local',
        workAddress: null,
        roleCard: null,
        returnWire: null,
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
        ...EMPTY_SPAWN_SPEC,
        returnWire: null,
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
          ...EMPTY_SPAWN_SPEC,
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
      providerName: 'Pi',
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
    expect(unsupported[1].help).toContain('Pi')
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
  const RESET_OK = { supportsReset: true }

  it('refuses a conversation answering itself, ahead of the trip (R6)', () => {
    const draft = newConnectionDraft({
      sourceSessionId: 'fable',
      targetSessionId: 'fable',
    })

    expect(connectionDraftProblem(draft, [], null, RESET_OK)).toContain(
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

    expect(connectionDraftProblem(draft, [existing], null, RESET_OK)).toContain(
      'already connected',
    )
    // The wire being edited is not its own duplicate.
    expect(
      connectionDraftProblem(draft, [existing], existing.id, RESET_OK),
    ).toBeNull()
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

    expect(connectionDraftProblem(draft, [existing], null, RESET_OK)).toBeNull()
  })

  it('asks for the missing half of each shape', () => {
    const empty = newConnectionDraft({ sourceSessionId: 'fable' })
    expect(connectionDraftProblem(empty, [], null, RESET_OK)).toContain(
      'should receive the reply',
    )

    expect(
      connectionDraftProblem(
        {
          ...empty,
          recipient: {
            kind: 'spawn',
            spec: {
              ...EMPTY_SPAWN_SPEC,
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
        RESET_OK,
      ),
    ).toContain('provider')
  })

  /**
   * M2. `clear` is a choice about a capability, so the refusal belongs to the
   * same function that refuses every other unsaveable shape -- and it takes
   * `supportsReset` as a required argument, so a caller cannot ask the
   * question without answering it. Without this, changing a recipient from a
   * provider that can reset to one that cannot left Save enabled and stored
   * `/clear` into a conversation that reads it as an ordinary message.
   *
   * Mutation that reds it: drop the `beforeDelivery === 'clear'` refusal.
   */
  it('accepts Clear for Codex and refuses unsupported recipients — disable Codex or remove the capability refusal turns red', () => {
    const draft = {
      ...newConnectionDraft({
        sourceSessionId: 'fable',
        targetSessionId: 'opus',
      }),
      beforeDelivery: 'clear' as const,
    }

    expect(
      connectionDraftProblem(draft, [], null, { supportsReset: false }),
    ).toContain('cannot start a conversation over')
    expect(
      connectionDraftProblem(draft, [], null, {
        supportsReset: buildFallbackCodexDescriptor().supportsConversationReset,
      }),
    ).toBeNull()
  })
})

/**
 * M2, the other half: the fallback, so the refusal above is a backstop rather
 * than a wall somebody has to work out how to get past. Changing the
 * recipient re-asks R8's question, and a choice the new provider cannot
 * honour is dropped -- out loud, never silently.
 */
describe('changeDraftRecipient', () => {
  const clearing = {
    ...newConnectionDraft({
      sourceSessionId: 'fable',
      targetSessionId: 'opus',
    }),
    beforeDelivery: 'clear' as const,
  }

  /** Mutation that reds it: keep `beforeDelivery` whatever the recipient is. */
  it('drops Clear when the new recipient cannot reset, and says so', () => {
    const result = changeDraftRecipient(
      clearing,
      { kind: 'session', sessionId: 'sol' },
      {
        supportsReset: buildFallbackPiDescriptor().supportsConversationReset,
        providerName: 'Pi',
      },
    )

    expect(result.draft.beforeDelivery).toBe('keep')
    expect(result.draft.recipient).toEqual({
      kind: 'session',
      sessionId: 'sol',
    })
    expect(result.note).toContain('Pi')
  })

  it('keeps Clear for Codex — disable the Codex reset capability turns red', () => {
    const result = changeDraftRecipient(
      clearing,
      { kind: 'session', sessionId: 'sol' },
      {
        supportsReset: buildFallbackCodexDescriptor().supportsConversationReset,
        providerName: 'Codex',
      },
    )

    expect(result.draft.beforeDelivery).toBe('clear')
    expect(result.note).toBeNull()
  })

  /**
   * A custom first message is text the person wrote; no provider can be
   * unable to receive it, so nothing is dropped and nothing is said.
   */
  it('leaves a custom first message alone', () => {
    const result = changeDraftRecipient(
      { ...clearing, beforeDelivery: 'custom', customOpener: 'Read HANDOFF.' },
      { kind: 'session', sessionId: 'sol' },
      {
        supportsReset: buildFallbackPiDescriptor().supportsConversationReset,
        providerName: 'Pi',
      },
    )

    expect(result.draft.beforeDelivery).toBe('custom')
    expect(result.draft.customOpener).toBe('Read HANDOFF.')
    expect(result.note).toBeNull()
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

it('refuses saving an unnamed remote place in the recipe (mutation: drop draft place guard)', () => {
  const draft = newConnectionDraft({ sourceSessionId: 'fable' })
  draft.recipient = {
    kind: 'spawn',
    spec: {
      ...EMPTY_SPAWN_SPEC,
      providerId: 'codex',
      executionHost: 'little-monster',
      projectId: 'p1',
      workAddress: null,
    },
  }
  expect(connectionDraftProblem(draft, [], null, { supportsReset: true })).toBe(
    REMOTE_SPAWN_PLACE_REQUIRED,
  )
})

it('inherits the remote project refusal (mutation: bypass draft requirements)', () => {
  const draft = newConnectionDraft({ sourceSessionId: 'fable' })
  draft.recipient = {
    kind: 'spawn',
    spec: {
      ...EMPTY_SPAWN_SPEC,
      providerId: 'codex',
      executionHost: 'little-monster',
      workAddress: {
        mode: 'project',
        projectId: 'remote',
        workingDirectory: '/repo',
        label: 'Remote',
      },
    },
  }
  expect(connectionDraftProblem(draft, [], null, { supportsReset: true })).toBe(
    'An errand on a remote host belongs to a project',
  )
})
