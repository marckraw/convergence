import { describe, expect, it } from 'vitest'
import { describeTurnFileChange } from './turn-file-change-notice.pure'

describe('describeTurnFileChange', () => {
  it('says nothing about a whole, textual change', () => {
    expect(describeTurnFileChange({ truncated: false, binary: false })).toEqual(
      [],
    )
  })

  it('says a truncated diff is a fragment', () => {
    // The failure this exists to prevent: a cut diff renders in a viewer that
    // looks exactly like one showing a whole change (MAR-2577).
    expect(describeTurnFileChange({ truncated: true, binary: false })).toEqual([
      {
        kind: 'truncated',
        text: 'Diff truncated — this is a fragment, not the whole change.',
      },
    ])
  })

  it('says a binary change has no textual diff', () => {
    expect(describeTurnFileChange({ truncated: false, binary: true })).toEqual([
      {
        kind: 'binary',
        text: 'Binary file — there is no textual diff to show.',
      },
    ])
  })

  it('names both when both are true, binary first', () => {
    expect(
      describeTurnFileChange({ truncated: true, binary: true }).map(
        (notice) => notice.kind,
      ),
    ).toEqual(['binary', 'truncated'])
  })

  it('says nothing when no file is selected', () => {
    expect(describeTurnFileChange(null)).toEqual([])
  })

  /**
   * The copy names no cutter on purpose. Local capture truncates at its own
   * 200 KB cap and a daemon truncates at whatever cap it keeps, and the same
   * flag carries both — so "truncated by the daemon" would be a second, smaller
   * lie on every local turn.
   */
  it('blames neither the daemon nor Convergence for the cut', () => {
    const text = describeTurnFileChange({ truncated: true, binary: false })[0]
      .text
    expect(text).not.toMatch(/daemon|Convergence|host/i)
  })
})
