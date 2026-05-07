import { describe, expect, it } from 'vitest'
import { parseUnifiedDiffForReviewAnchors } from './diff-lines.pure'
import {
  mapDiffLineIdsToPierreSelection,
  mapPierreSelectionToDiffLineIds,
} from './pierre-diff-selection.pure'

const diff = [
  '@@ -1,3 +1,3 @@',
  ' unchanged',
  '-old value',
  '+new value',
  ' still here',
].join('\n')

describe('Pierre diff selection helpers', () => {
  it('maps Pierre addition ranges back to existing diff line ids', () => {
    const lines = parseUnifiedDiffForReviewAnchors(diff)

    expect(
      mapPierreSelectionToDiffLineIds({
        lines,
        range: {
          start: 1,
          side: 'additions',
          end: 2,
          endSide: 'additions',
        },
      }),
    ).toEqual(['diff-line-1', 'diff-line-2', 'diff-line-3'])
  })

  it('maps mixed deletion-to-addition ranges by rendered diff order', () => {
    const lines = parseUnifiedDiffForReviewAnchors(diff)

    expect(
      mapPierreSelectionToDiffLineIds({
        lines,
        range: {
          start: 2,
          side: 'deletions',
          end: 2,
          endSide: 'additions',
        },
      }),
    ).toEqual(['diff-line-2', 'diff-line-3'])
  })

  it('maps existing selected diff ids to Pierre selected line ranges', () => {
    const lines = parseUnifiedDiffForReviewAnchors(diff)

    expect(
      mapDiffLineIdsToPierreSelection({
        lines,
        selectedIds: ['diff-line-2', 'diff-line-3'],
      }),
    ).toEqual({
      start: 2,
      side: 'deletions',
      end: 2,
      endSide: 'additions',
    })
  })
})
