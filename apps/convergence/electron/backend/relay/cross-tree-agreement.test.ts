import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CREW_ROUND_CAP,
  batonConditionToken,
  normalizeRelayConditionToken,
  relayConditionMatches,
} from './relay.pure'
import { DEFAULT_CREW_STALL_MINUTES } from './crew-hail.pure'
// Deep, deliberately, and only here. The renderer file below IS the artifact
// under test, and going through the slice's public index would drag its
// components into a node-environment test to reach two numbers and a string.
// Same workspace, plain TypeScript, imports nothing: this file only reads it.
import {
  DEFAULT_CREW_ROUND_CAP as RENDERER_ROUND_CAP,
  DEFAULT_CREW_STALL_MINUTES as RENDERER_STALL_MINUTES,
  batonConditionToken as rendererBatonConditionToken,
} from '../../../src/features/mission-control/crew-loop.pure'

/**
 * The one test that can see both trees at once.
 *
 * The renderer cannot import from `electron/`, so the loop's two defaults and
 * the `BATON:` convention live on both sides. Each side pins its own literal
 * -- and that is exactly what is NOT an agreement: an intentional edit to the
 * engine's cap plus its own assertion leaves every suite green while the box
 * in the UI still promises the old number.
 *
 * This is the barrier. It fails when the two sides stop meaning the same
 * thing, which is the only failure the per-side tests cannot see.
 */
describe('the literals that cross the tree boundary (MAR-2759)', () => {
  it('agrees on the round cap an empty box means', () => {
    expect(RENDERER_ROUND_CAP).toBe(DEFAULT_CREW_ROUND_CAP)
  })

  it('agrees on the stall window an empty box means', () => {
    expect(RENDERER_STALL_MINUTES).toBe(DEFAULT_CREW_STALL_MINUTES)
  })

  it('pre-fills a condition the engine itself would store', () => {
    // Not string equality with the backend's own helper: the question is
    // whether what the editor writes into the box is a token the engine
    // ACCEPTS, which is the promise the pre-fill button makes.
    for (const name of ['horse', 'codex', 'Fable']) {
      const suggested = rendererBatonConditionToken(name)
      expect(() => normalizeRelayConditionToken(suggested)).not.toThrow()
      expect(normalizeRelayConditionToken(suggested)).toBe(suggested)
    }
  })

  it('pre-fills a condition the engine matches against the declared route', () => {
    // The whole crossing, end to end: the station writes the convention, the
    // wire was pre-filled with it, and the engine's one string compare says
    // yes. A different spelling on either side breaks here and nowhere else.
    for (const name of ['horse', 'codex', 'fable']) {
      const message = `Round 1 is in.\n\n${batonConditionToken(name)}`
      expect(
        relayConditionMatches(rendererBatonConditionToken(name), message),
      ).toBe(true)
    }
  })

  it('pre-fills a condition that does not answer somebody else route', () => {
    expect(
      relayConditionMatches(
        rendererBatonConditionToken('horse'),
        'Done.\n\nBATON: codex',
      ),
    ).toBe(false)
  })
})
