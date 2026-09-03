import { describe, expect, it } from 'vitest'
import {
  ALREADY_FIRED_MESSAGE,
  DEFAULT_SPAWN_NAME,
  MAX_AUTOMATIC_HOPS_PER_FLOW_RUN,
  MAX_RELAY_INSTRUCTION_LENGTH,
  MAX_RELAY_CONDITION_TOKEN_LENGTH,
  MAX_RELAY_OPENER_LENGTH,
  DEFAULT_CREW_ROUND_CAP,
  batonConditionToken,
  hasRoundBudget,
  normalizeRelayConditionToken,
  readEmittedBaton,
  relayConditionMatches,
  resolveRoundCap,
  roundBudgetMessage,
  roundNumber,
  RELAY_OPENER_PREVIEW_LENGTH,
  RELAY_PAYLOAD_PREVIEW_LENGTH,
  assertRelayEndpoints,
  normalizeRelaySpawnSpec,
  buildPayloadPreview,
  buildRelayHopPreview,
  compileRelayPayload,
  flowRunBudgetMessage,
  hasFlowRunBudget,
  isBudgetedOutcome,
  normalizeRelayAction,
  normalizeRelayCrewId,
  normalizeRelayInstruction,
  normalizeRelayOpener,
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

describe('ALREADY_FIRED_MESSAGE', () => {
  it('explains the law instead of reporting a fault', () => {
    expect(ALREADY_FIRED_MESSAGE).toContain('already fired in this run')
    expect(ALREADY_FIRED_MESSAGE).toContain('once per run')
    // The loop law is not a failure, so its sentence must not read like one.
    expect(ALREADY_FIRED_MESSAGE.toLowerCase()).not.toContain('error')
    expect(ALREADY_FIRED_MESSAGE.toLowerCase()).not.toContain('failed')
  })
})

describe('normalizeRelayInstruction', () => {
  it('keeps a real brief, trimmed', () => {
    expect(normalizeRelayInstruction('  Review this and push back.  ')).toBe(
      'Review this and push back.',
    )
  })

  it('treats blank as no instruction at all', () => {
    // An empty string would compile into every payload as a stray blank line;
    // null is what "carry the message as it is" has always meant.
    expect(normalizeRelayInstruction('')).toBeNull()
    expect(normalizeRelayInstruction('   \n\t  ')).toBeNull()
    expect(normalizeRelayInstruction(null)).toBeNull()
    expect(normalizeRelayInstruction(undefined)).toBeNull()
  })

  it('keeps the shape of a multi-line brief', () => {
    expect(normalizeRelayInstruction('Do this.\n\nThen that.')).toBe(
      'Do this.\n\nThen that.',
    )
  })

  it('refuses a brief nobody meant to write, in words', () => {
    const tooLong = 'x'.repeat(MAX_RELAY_INSTRUCTION_LENGTH + 1)

    expect(() => normalizeRelayInstruction(tooLong)).toThrow(
      String(MAX_RELAY_INSTRUCTION_LENGTH),
    )
    expect(
      normalizeRelayInstruction('x'.repeat(MAX_RELAY_INSTRUCTION_LENGTH)),
    ).toHaveLength(MAX_RELAY_INSTRUCTION_LENGTH)
  })
})

describe('compileRelayPayload', () => {
  const MESSAGE = 'Branch is green, 12 files changed.'

  it('carries the message untouched when no instruction was written', () => {
    // Byte-identical, deliberately: every wire drawn before instructions
    // existed must keep sending exactly what it always sent.
    expect(compileRelayPayload(null, MESSAGE)).toBe(MESSAGE)
    expect(compileRelayPayload('', MESSAGE)).toBe(MESSAGE)
    expect(compileRelayPayload('   ', MESSAGE)).toBe(MESSAGE)
  })

  it('puts the brief above the message with a blank line between', () => {
    expect(compileRelayPayload('Take a look at this.', MESSAGE)).toBe(
      `Take a look at this.\n\n${MESSAGE}`,
    )
  })

  it('leaves the message itself exactly as the session wrote it', () => {
    const messy = '  Leading spaces and a trailing newline.\n'

    expect(compileRelayPayload('Brief.', messy)).toBe(`Brief.\n\n${messy}`)
  })

  /**
   * The MAR-2280 law, at the string level: the separator is load-bearing.
   * `src/features/mission-control/relay-payload.render.test.tsx` proves the
   * same thing through a markdown renderer, which is where the original bug
   * hid -- it lives over there because this tree has no DOM.
   */
  it('never lets the brief run straight into the message', () => {
    const compiled = compileRelayPayload('Read this and', MESSAGE)

    expect(compiled).toContain('\n\n')
    expect(compiled).not.toBe(`Read this and\n${MESSAGE}`)
    expect(compiled.split('\n\n')[0]).toBe('Read this and')
  })

  it('separates a brief from a message that opens a markdown block', () => {
    for (const opener of [
      '> quoted line',
      '```ts\nconst a = 1\n```',
      '- item',
    ]) {
      expect(compileRelayPayload('Brief.', opener)).toBe(`Brief.\n\n${opener}`)
    }
  })
})

describe('normalizeRelayOpener', () => {
  it('keeps a real opener, trimmed', () => {
    expect(normalizeRelayOpener('  /clear  ')).toBe('/clear')
  })

  it('treats blank as no first send at all', () => {
    // An empty box means "just deliver the payload", which is what every wire
    // did before openers existed. An empty string would be a send of nothing.
    expect(normalizeRelayOpener('')).toBeNull()
    expect(normalizeRelayOpener('   \n\t ')).toBeNull()
    expect(normalizeRelayOpener(null)).toBeNull()
    expect(normalizeRelayOpener(undefined)).toBeNull()
  })

  /**
   * The opener is plain text on purpose: `/clear` is Claude's word, and the
   * same box on another provider may hold an ordinary sentence.
   */
  it('does not care whether the opener is a slash command', () => {
    expect(normalizeRelayOpener('Forget everything above.')).toBe(
      'Forget everything above.',
    )
  })

  it('refuses an opener nobody meant to write, in words', () => {
    const tooLong = 'x'.repeat(MAX_RELAY_OPENER_LENGTH + 1)

    expect(() => normalizeRelayOpener(tooLong)).toThrow(
      String(MAX_RELAY_OPENER_LENGTH),
    )
    expect(
      normalizeRelayOpener('x'.repeat(MAX_RELAY_OPENER_LENGTH)),
    ).toHaveLength(MAX_RELAY_OPENER_LENGTH)
  })
})

describe('buildRelayHopPreview', () => {
  it('previews the payload alone when the wire has no opener', () => {
    // Byte-identical to the preview this wire wrote before openers existed.
    expect(buildRelayHopPreview(null, 'Branch is green.')).toBe(
      buildPayloadPreview('Branch is green.'),
    )
  })

  it('names both beats when the wire opens with one', () => {
    expect(buildRelayHopPreview('/clear', 'Branch is green.')).toBe(
      'First send: /clear · then: Branch is green.',
    )
  })

  it('keeps the payload visible behind a long opener', () => {
    // Both beats or the row lies about what the target received, so the opener
    // gets a budget of its own rather than eating the whole preview.
    const preview = buildRelayHopPreview(
      'x'.repeat(MAX_RELAY_OPENER_LENGTH),
      'Branch is green.',
    )

    expect(preview).toContain('Branch is green.')
    expect(preview!.length).toBeLessThanOrEqual(RELAY_PAYLOAD_PREVIEW_LENGTH)
    expect(preview).toContain(`${'x'.repeat(RELAY_OPENER_PREVIEW_LENGTH - 1)}…`)
  })

  it('collapses an opener written across lines into one', () => {
    expect(buildRelayHopPreview('/clear\n', 'Done.')).toBe(
      'First send: /clear · then: Done.',
    )
  })

  it('still names the opener when there is nothing to carry', () => {
    expect(buildRelayHopPreview('/clear', '   ')).toBe('First send: /clear')
  })
})

describe('readEmittedBaton', () => {
  it('reads the declaration on the last non-empty line', () => {
    expect(readEmittedBaton('Round 3 looks good.\n\nBATON: horse\n')).toBe(
      'horse',
    )
  })

  it('is case-insensitive on both the keyword and the name', () => {
    expect(readEmittedBaton('baton: Horse')).toBe('horse')
  })

  it('collapses the whitespace inside a declaration', () => {
    expect(readEmittedBaton('BATON:   the   horse')).toBe('the horse')
  })

  it('reads nothing when the baton is not on the last line', () => {
    expect(readEmittedBaton('BATON: horse\n\nand one more thought')).toBeNull()
  })

  it('never searches prose for a baton', () => {
    expect(readEmittedBaton('I would hand the BATON: horse next.')).toBeNull()
  })

  it('reads nothing from a message that declares nothing', () => {
    expect(readEmittedBaton('All green, nothing to add.')).toBeNull()
  })

  it('reads nothing from a keyword with no name after it', () => {
    expect(readEmittedBaton('BATON:   ')).toBeNull()
  })
})

describe('relayConditionMatches', () => {
  it('fires unconditionally when the wire carries no token', () => {
    expect(relayConditionMatches(null, 'anything at all')).toBe(true)
  })

  it('matches the last non-empty line exactly, ignoring case and spacing', () => {
    expect(
      relayConditionMatches('BATON: horse', 'Done.\n\n  baton:  HORSE  \n\n'),
    ).toBe(true)
  })

  it('refuses a message whose last line is a different baton', () => {
    expect(relayConditionMatches('BATON: horse', 'Done.\n\nBATON: codex')).toBe(
      false,
    )
  })

  it('refuses a message that declares nothing', () => {
    expect(relayConditionMatches('BATON: horse', 'Done.')).toBe(false)
  })

  it('refuses a baton mentioned anywhere but the last line', () => {
    expect(
      relayConditionMatches('BATON: horse', 'BATON: horse\n\nOne more thing.'),
    ).toBe(false)
  })

  it('compares whole lines, never prefixes', () => {
    expect(
      relayConditionMatches('BATON: horse', 'Done.\n\nBATON: horseman'),
    ).toBe(false)
  })

  it('matches a token that is not a baton declaration at all', () => {
    expect(relayConditionMatches('DONE', 'Finished.\n\ndone')).toBe(true)
  })
})

describe('normalizeRelayConditionToken', () => {
  it('stores a blank box as no condition', () => {
    expect(normalizeRelayConditionToken('   ')).toBeNull()
    expect(normalizeRelayConditionToken(null)).toBeNull()
    expect(normalizeRelayConditionToken(undefined)).toBeNull()
  })

  it('keeps the token as the user wrote it, trimmed', () => {
    expect(normalizeRelayConditionToken('  BATON: horse  ')).toBe(
      'BATON: horse',
    )
  })

  it('refuses a token that spans more than one line', () => {
    expect(() =>
      normalizeRelayConditionToken('BATON: horse\nBATON: codex'),
    ).toThrow('A relay condition is one line')
  })

  it('refuses the reserved terminal baton, whatever its spelling', () => {
    expect(() => normalizeRelayConditionToken('baton:   MARCIN')).toThrow(
      'BATON: marcin is reserved',
    )
  })

  it('refuses a token longer than the limit', () => {
    expect(() =>
      normalizeRelayConditionToken(
        'x'.repeat(MAX_RELAY_CONDITION_TOKEN_LENGTH + 1),
      ),
    ).toThrow('cannot be longer than')
  })
})

describe('batonConditionToken', () => {
  it('writes the convention a wire is pre-filled with', () => {
    expect(batonConditionToken('horse')).toBe('BATON: horse')
  })
})

describe('the round budget', () => {
  it('defaults to twelve rounds when a crew names no cap', () => {
    expect(resolveRoundCap(null)).toBe(DEFAULT_CREW_ROUND_CAP)
    expect(DEFAULT_CREW_ROUND_CAP).toBe(12)
  })

  it('takes the crew own cap when it named one', () => {
    expect(resolveRoundCap(2)).toBe(2)
  })

  it('falls back for a cap no crew could have meant', () => {
    expect(resolveRoundCap(0)).toBe(DEFAULT_CREW_ROUND_CAP)
    expect(resolveRoundCap(-3)).toBe(DEFAULT_CREW_ROUND_CAP)
    expect(resolveRoundCap(1.5)).toBe(DEFAULT_CREW_ROUND_CAP)
  })

  it('numbers the round after the hops already spent', () => {
    expect(roundNumber(0)).toBe(1)
    expect(roundNumber(11)).toBe(12)
  })

  it('lets a run spend rounds up to and including the cap', () => {
    expect(hasRoundBudget(11, 12)).toBe(true)
    expect(hasRoundBudget(12, 12)).toBe(false)
  })

  it('names the number in the sentence it writes', () => {
    expect(roundBudgetMessage(12)).toContain('12')
  })
})

describe('compileRelayPayload with a round', () => {
  it('stamps the round into the brief, above the message', () => {
    expect(
      compileRelayPayload('Fix the findings.', 'Round 2 verdict.', 3),
    ).toBe('Fix the findings.\n\nround 3\n\nRound 2 verdict.')
  })

  it('leaves an unbriefed wire carrying the message byte for byte', () => {
    expect(compileRelayPayload(null, 'Round 2 verdict.', 3)).toBe(
      'Round 2 verdict.',
    )
  })
})
