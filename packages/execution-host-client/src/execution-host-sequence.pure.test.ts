import { describe, expect, it } from 'vitest'
import { describeSeqGap, readEnvelopeSeq } from './execution-host-sequence.pure'

/**
 * The rule the wire protocol states, pinned in the one place both clients read
 * it from (MAR-2779).
 */
describe('readEnvelopeSeq', () => {
  it('accepts only the next contiguous sequence', () => {
    expect(readEnvelopeSeq(0, 1)).toBe('accept')
    expect(readEnvelopeSeq(2, 3)).toBe('accept')
  })

  it('reads anything at or below the mark as a replay', () => {
    // A resume asks for everything after `lastSeq` and a daemon under load can
    // still re-send the boundary itself; neither is progress.
    expect(readEnvelopeSeq(2, 2)).toBe('duplicate')
    expect(readEnvelopeSeq(2, 1)).toBe('duplicate')
  })

  it('reads a skipped sequence as a gap rather than as progress', () => {
    // The defect this organ exists for: `4` after `2` used to advance the mark
    // to 4, and `3` was never asked for again by anybody.
    expect(readEnvelopeSeq(2, 4)).toBe('gap')
    expect(readEnvelopeSeq(0, 2)).toBe('gap')
  })

  it('treats a stream that has delivered nothing as starting before one', () => {
    // `lastSeq` is 0 on a cold start, so the daemon's first envelope is 1 and
    // a first envelope of 2 is already a hole.
    expect(readEnvelopeSeq(0, 1)).toBe('accept')
    expect(readEnvelopeSeq(0, 0)).toBe('duplicate')
  })
})

describe('describeSeqGap', () => {
  it('names what was expected, what came, and where the resume starts', () => {
    // Three numbers, because a reader of a debug log has none of them: the
    // sentence has to say how big the hole was and what will be re-requested.
    expect(describeSeqGap(2, 4)).toBe(
      'gap: expected 3, got 4; reconnecting from 2',
    )
  })
})
