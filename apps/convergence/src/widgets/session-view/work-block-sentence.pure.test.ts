import { describe, expect, it } from 'vitest'
import {
  indexBlockSentences,
  workBlockSentence,
} from './work-block-sentence.pure'

const row = (firstItemId: string, lastItemId: string, sentence: string) => ({
  sessionId: 's1',
  firstItemId,
  lastItemId,
  sentence,
  model: 'gpt-6-luna',
  createdAt: '2026-09-25T00:00:00.000Z',
})

describe('which stored sentence a block row shows (MAR-3395 R5)', () => {
  const index = indexBlockSentences([
    row('a', 'c', 'Read three files.'),
    row('d', 'f', 'Ran three commands.'),
  ])

  it('the sentence written about exactly this block', () => {
    expect(workBlockSentence(index, 'a', 'c')).toBe('Read three files.')
    expect(workBlockSentence(index, 'd', 'f')).toBe('Ran three commands.')
  })

  it('none for a block that grew or folds differently, or has none', () => {
    expect(workBlockSentence(index, 'a', 'z')).toBeNull()
    expect(workBlockSentence(index, 'x', 'c')).toBeNull()
  })
})
