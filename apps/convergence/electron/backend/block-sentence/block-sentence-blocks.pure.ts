import {
  groupWorkBlocks,
  workBlockRole,
} from '../../../src/entities/session/work-blocks.pure'
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

/**
 * Whether a newly recorded item can close a block (MAR-3422 CV3d R1): a
 * boundary by the fold rule, and not a subagent's own work (which
 * `turnWorkBlocks` leaves to the sidebar). Read from the item alone, so the
 * insert path learns it without touching the database.
 */
export function closesWorkBlock(item: ConversationItem): boolean {
  return !isSubagentWork(item) && workBlockRole(item) === 'boundary'
}

/** What a mid-turn fold found (R1, R4). */
export interface ClosedBlocksSince {
  /** Closed, settled blocks of three or more members, in close order. */
  blocks: TurnWorkBlock[]
  /**
   * The sequence the next read starts after: the last boundary with nothing
   * undecided before it. Null when the items hold no such boundary, so the
   * previous cursor stands.
   */
  cursor: number | null
}

/**
 * The blocks a boundary closed, folded from the items recorded after the
 * previous cursor (R1, R4).
 *
 * The cursor is always a boundary, and a boundary leaves the fold with no
 * open block and no pending thinking -- the state it starts in. So folding
 * from just after it gives exactly the rows folding the whole turn gives for
 * the same items, without reading them again.
 *
 * A block is closed when a boundary follows its last member. A closed block
 * with a `streaming` member is not settled: it, and every block after it,
 * waits, and the cursor stays before it so the next read sees it again. The
 * trailing block is never closed here; the turn end asks for it.
 */
export function closedBlocksSince(
  items: readonly ConversationItem[],
): ClosedBlocksSince {
  const visible = items.filter((item) => !isSubagentWork(item))
  // The same predicate the insert path asks: what queues a fold is exactly
  // what the fold counts as closing.
  const boundaries = visible
    .filter(closesWorkBlock)
    .map((item) => item.sequence)
  const lastBoundary = boundaries.at(-1)
  if (lastBoundary === undefined) return { blocks: [], cursor: null }

  const sequenceOf = new Map(visible.map((item) => [item.id, item.sequence]))
  const bySequence = (id: string) => sequenceOf.get(id)!
  let stopAt = Number.POSITIVE_INFINITY
  const blocks: TurnWorkBlock[] = []
  for (const block of turnWorkBlocks(visible)) {
    if (bySequence(block.lastItemId) > lastBoundary) break
    if (block.members.some((member) => member.state === 'streaming')) {
      stopAt = bySequence(block.firstItemId)
      break
    }
    if (block.members.length >= BLOCK_SENTENCE_MIN_MEMBERS) blocks.push(block)
  }
  const settled = boundaries.filter((sequence) => sequence < stopAt)
  return { blocks, cursor: settled.at(-1) ?? null }
}
