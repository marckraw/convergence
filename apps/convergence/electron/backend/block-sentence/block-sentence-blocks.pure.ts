import { groupWorkBlocks } from '../../../src/entities/session/work-blocks.pure'
import { isSubagentWork } from '../../../src/shared/lib/parallel-work.pure'
import type { ConversationItem } from '../session/conversation-item.types'
import {
  BLOCK_SENTENCE_MIN_MEMBERS,
  BLOCK_SENTENCE_MAX_PER_TURN,
} from './block-sentence.pure'

/** One closed block of a finished turn, as main folds it (R1). */
export interface TurnWorkBlock {
  /** The block's id: its first member's id, as the renderer keys it. */
  firstItemId: string
  lastItemId: string
  members: ConversationItem[]
}

/**
 * A finished turn's blocks, folded by the renderer's own rule (R1): the same
 * `groupWorkBlocks`, over the turn's items without the subagents' own work
 * (the transcript draws that in the sidebar). A block the renderer folds
 * differently -- a parallel-work marker, a compaction mid-turn -- has a
 * different first or last member there, and the renderer then shows no
 * sentence for it rather than one written about other steps.
 */
export function turnWorkBlocks(
  items: readonly ConversationItem[],
): TurnWorkBlock[] {
  const visible = items.filter((item) => !isSubagentWork(item))
  const blocks: TurnWorkBlock[] = []
  for (const row of groupWorkBlocks(visible, (item) => item)) {
    if (row.kind !== 'block') continue
    blocks.push({
      firstItemId: row.id,
      lastItemId: row.members.at(-1)!.id,
      members: row.members,
    })
  }
  return blocks
}

/**
 * Which blocks of a finished turn get a request (R2): at least three
 * members, no sentence stored yet, and at most twenty per turn in order.
 */
export function blocksToDescribe(
  items: readonly ConversationItem[],
  hasSentence: (firstItemId: string) => boolean,
): TurnWorkBlock[] {
  return turnWorkBlocks(items)
    .filter(
      (block) =>
        block.members.length >= BLOCK_SENTENCE_MIN_MEMBERS &&
        !hasSentence(block.firstItemId),
    )
    .slice(0, BLOCK_SENTENCE_MAX_PER_TURN)
}
