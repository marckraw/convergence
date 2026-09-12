import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CREW_ROUND_CAP,
  DEFAULT_CREW_STALL_MINUTES,
  MIN_FLOW_RUN_HOP_CEILING,
  batonConditionToken,
  batonNameRefusal,
  flowRunCeiling,
  flowRunCeilingNote,
  formatCrewLoopDefault,
} from './crew-loop.pure'

/**
 * The renderer half of a value that lives on both sides of the tree boundary.
 *
 * The engine's own halves are pinned in
 * `electron/backend/relay/relay.pure.test.ts` and
 * `electron/backend/relay/crew-hail.pure.test.ts`. Between the two, a number
 * changed on one side and not the other cannot ship quietly — which is the
 * only protection a duplicated constant can have.
 */
describe('the crew loop defaults, on the renderer side of the boundary', () => {
  it('pins the round cap the engine resolves to', () => {
    expect(DEFAULT_CREW_ROUND_CAP).toBe(12)
  })

  it('pins the stall window the engine resolves to', () => {
    expect(DEFAULT_CREW_STALL_MINUTES).toBe(30)
  })

  it('says the number rather than the word default', () => {
    expect(formatCrewLoopDefault(12, 'rounds')).toBe('12 rounds')
  })

  it('pins the floor under a run hop ceiling the engine applies', () => {
    expect(MIN_FLOW_RUN_HOP_CEILING).toBe(20)
  })
})

/** R3's sentence for a crew at or above the floor, spelled once. */
const ABOVE_THE_FLOOR =
  "This is also the run's hard ceiling. Inside this crew the limit hails and the wire stays armed; a run that crosses into another crew is disarmed past it."

describe('the sentence the delivery limit box says about the ceiling (R3)', () => {
  it('tells a crew above the floor that its own limit is the ceiling', () => {
    expect(flowRunCeilingNote(48)).toBe(ABOVE_THE_FLOOR)
    expect(flowRunCeilingNote(MIN_FLOW_RUN_HOP_CEILING)).toContain(
      'hard ceiling',
    )
  })

  it('names the real number to a crew the floor overrules', () => {
    // The honest half. At twelve nothing is disarmed -- the delivery limit
    // hails and the wire stays armed -- so a note claiming otherwise would
    // blur the one distinction the two guards exist for.
    // Mutation that reds it: return R3's sentence unconditionally.
    const note = flowRunCeilingNote(DEFAULT_CREW_ROUND_CAP)
    expect(note).toBe(
      "The run's hard ceiling is 20. Inside this crew the limit hails and the wire stays armed; a run that crosses into another crew is disarmed past 20.",
    )
    expect(note).not.toContain(String(DEFAULT_CREW_ROUND_CAP))
  })

  it('never promises a single-crew loop that its own limit disarms', () => {
    // Lap 2's correction. The two guards count different things -- the limit
    // counts this crew's hops, the backstop the whole run across crews -- so
    // a crew at cap 60 trips its limit at hop 60 and the ceiling standing at
    // the same number is unreachable from inside it. Both sentences must say
    // so. Mutation that reds it: drop the condition from either branch and
    // promise a disarm flatly.
    for (const cap of [1, DEFAULT_CREW_ROUND_CAP, 20, 48, 60]) {
      const note = flowRunCeilingNote(cap)
      expect(note).toContain('Inside this crew the limit hails')
      expect(note).toContain('crosses into another crew is disarmed')
    }
  })

  it('derives the number from the ceiling rather than restating it', () => {
    // Mutation that reds it: hard-code twenty in the sentence.
    expect(flowRunCeiling(DEFAULT_CREW_ROUND_CAP)).toBe(
      MIN_FLOW_RUN_HOP_CEILING,
    )
    expect(flowRunCeilingNote(1)).toContain(
      String(flowRunCeiling(MIN_FLOW_RUN_HOP_CEILING)),
    )
  })
})

describe('batonConditionToken, the convention across the tree boundary', () => {
  it('writes the exact line the engine reads', () => {
    // Pinned on this side because the engine writes the same string in
    // `electron/backend/relay/relay.pure.ts` and neither tree can import the
    // other. Agreement between the two is a separate barrier:
    // `electron/backend/relay/cross-tree-agreement.test.ts`.
    expect(batonConditionToken('horse')).toBe('BATON: horse')
  })

  it('writes the spelling the engine stores, not the one that was typed', () => {
    expect(batonConditionToken('  Horse  ')).toBe('BATON: horse')
  })
})

describe('batonNameRefusal, the sentence a refused rename shows', () => {
  it('unwraps the sentence Electron buried in its own plumbing', () => {
    // What actually reaches the renderer when the main process throws.
    expect(
      batonNameRefusal(
        new Error(
          "Error invoking remote method 'crew:setMemberBatonName': Error: A baton name cannot start or end with a formatting mark",
        ),
      ),
    ).toBe('A baton name cannot start or end with a formatting mark')
  })

  it('shows a plain sentence exactly as it was thrown', () => {
    expect(
      batonNameRefusal(new Error('A baton name cannot contain a colon')),
    ).toBe('A baton name cannot contain a colon')
  })

  it('always has something to say, whatever was thrown', () => {
    // A refusal nobody can read is the swallow again, one layer down.
    expect(batonNameRefusal(undefined)).toBe('That baton name was refused.')
    expect(batonNameRefusal(new Error('   '))).toBe(
      'That baton name was refused.',
    )
  })
})
