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

/** The three facts about a queued row that the reading below needs. */
export interface StaleResetQueueRow {
  state: QueuedInputState
  text: string
  queuePosition: number
}

export interface StaleReset<T extends StaleResetQueueRow> {
  /** The `/clear` the stalled turn was carrying. */
  reset: T
  /** Every row still `queued` after it, in line order. */
  behind: T[]
}

/**
 * Was the turn a restart interrupted a conversation reset, and which rows
 * stand behind it (MAR-3307 R1)?
 *
 * Read from the queue alone, because the record keeps nothing else about a
 * reset. Among the session's rows in line order, the last one that went out
 * (`sent`) or was on its way (`dispatching`) is the turn in flight. If its
 * text is the reset word, the reset never finished, and the rows still
 * `queued` after it are waiting for a drain that no process will run.
 *
 * Matched by TEXT, never by `delivery_mode` or by place in line. An opener
 * is a `follow-up` like any queued message, and "first in line" is true of
 * ordinary work too. The text is the only thing that makes a row a reset.
 *
 * Returns null for any other turn, including a normal message with rows
 * queued behind it (MAR-2971). A turn that ends is not a reset.
 */
export function readStaleResetFromQueue<T extends StaleResetQueueRow>(
  rows: readonly T[],
): StaleReset<T> | null {
  const ordered = [...rows].sort((a, b) => a.queuePosition - b.queuePosition)
  let lastOut = -1
  ordered.forEach((row, index) => {
    if (row.state === 'sent' || row.state === 'dispatching') lastOut = index
  })
  if (lastOut === -1) return null
  const reset = ordered[lastOut]
  if (reset.text !== CONVERSATION_RESET_COMMAND) return null
  return {
    reset,
    behind: ordered.slice(lastOut + 1).filter((row) => row.state === 'queued'),
  }
}
