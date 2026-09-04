import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CREW_ROUND_CAP,
  DEFAULT_CREW_STALL_MINUTES,
  batonConditionToken,
  batonNameRefusal,
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
