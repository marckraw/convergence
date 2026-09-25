import type { BlockSentenceData } from '@/shared/types/electron-api'

export type BlockSentenceIndex = ReadonlyMap<
  string,
  Pick<BlockSentenceData, 'lastItemId' | 'sentence'>
>

export function indexBlockSentences(
  sentences: readonly BlockSentenceData[],
): BlockSentenceIndex {
  return new Map(
    sentences.map((row) => [
      row.firstItemId,
      { lastItemId: row.lastItemId, sentence: row.sentence },
    ]),
  )
}

/**
 * The sentence a block row shows (MAR-3395 R5): only one written about this
 * exact block -- same first member AND same last member. A block the window
 * folds differently from main (a marker, a compaction) shows its facts only.
 */
export function workBlockSentence(
  index: BlockSentenceIndex,
  blockId: string,
  lastMemberId: string,
): string | null {
  const stored = index.get(blockId)
  return stored && stored.lastItemId === lastMemberId ? stored.sentence : null
}
