import { CONVERSATION_RESET_COMMAND } from '../../../src/shared/lib/conversation-reset.pure'
import type { QueuedInputState } from './session.types'

/** Why a row behind a reset a restart interrupted was failed (MAR-3307 R2). */
export const STALE_RESET_ROW_ERROR =
  'Convergence restarted during /clear before this could be delivered — send it again'

/**
 * The transcript note's event type: a new value, named for what it reports.
 * Other boot notes use `system`, and this one is the reset's own story.
 */
export const STALE_RESET_NOTE_EVENT_TYPE = 'conversation-reset'

/** The transcript's one line about the rows boot failed behind a reset. */
export function staleResetNoteText(count: number): string {
  return count === 1
    ? 'Convergence restarted during /clear; 1 message behind it was not delivered — send it again.'
    : `Convergence restarted during /clear; ${count} messages behind it were not delivered — send them again.`
}

/** The four facts about a queued row that the reading below needs. */
export interface StaleResetQueueRow {
  state: QueuedInputState
  text: string
  queuePosition: number
  /** The row's last state stamp: for a `sent` row, when the provider took it. */
  updatedAt: string
}

export interface StaleReset<T extends StaleResetQueueRow> {
  /** The `/clear` the stalled turn was carrying. */
  reset: T
  /** Every row still `queued` after it, in line order. */
  behind: T[]
}

/**
 * The texts of the session's user messages recorded AT OR AFTER `stamp`.
 * The caller reads the record; the decision stays here.
 */
export type LaterUserTexts = (stamp: string) => readonly string[]

/**
 * Was the turn a restart interrupted a conversation reset, and which rows
 * stand behind it (MAR-3307 R1)?
 *
 * Two readings of the record, both needed:
 *
 * 1. The queue. Among the session's rows in line order, the last one that
 *    went out (`sent`) or was on its way (`dispatching`) must carry the reset
 *    word. Matched by TEXT, never by `delivery_mode` or by place in line: an
 *    opener is a `follow-up` like any queued message, and "first in line" is
 *    true of ordinary work too.
 *
 * 2. The conversation after it. `sent` is stamped when the provider TAKES the
 *    turn, so a reset in flight and a reset that finished long ago are the
 *    same row. What tells them apart: the reset is in flight iff no user
 *    message other than the reset word itself was recorded at or after the
 *    row's stamp. Pi, Codex and Cursor record no user message for a `/clear`
 *    (zero later texts); Claude Code records its own `/clear` prompt, right
 *    after the stamp and possibly in the same millisecond (hence "at or
 *    after", and hence the reset word is not counted). A human who spoke
 *    after the reset proves it finished: a finished reset drains its brief,
 *    so the rows queued now belong to the human's turn (MAR-2971) -> null.
 *
 * The one edge, known and accepted: a human who sends `/clear` AGAIN, by
 * hand, after a reset finished, looks like silence. A follow-up queued
 * behind that is then failed LOUDLY at boot, with the retry offered: a loud
 * false positive on a failed seat, never a silent stall. (MAR-3343 retires
 * this reading for a persisted fact.)
 *
 * Returns null for any other turn, including a normal message with rows
 * queued behind it (MAR-2971). A turn that ends is not a reset.
 */
export function readStaleResetFromQueue<T extends StaleResetQueueRow>(
  rows: readonly T[],
  laterUserTexts: LaterUserTexts,
): StaleReset<T> | null {
  const ordered = [...rows].sort((a, b) => a.queuePosition - b.queuePosition)
  let lastOut = -1
  ordered.forEach((row, index) => {
    if (row.state === 'sent' || row.state === 'dispatching') lastOut = index
  })
  if (lastOut === -1) return null
  const reset = ordered[lastOut]
  if (reset.text !== CONVERSATION_RESET_COMMAND) return null
  const spokeAfter = laterUserTexts(reset.updatedAt).some(
    (text) => text !== CONVERSATION_RESET_COMMAND,
  )
  if (spokeAfter) return null
  return {
    reset,
    behind: ordered.slice(lastOut + 1).filter((row) => row.state === 'queued'),
  }
}
