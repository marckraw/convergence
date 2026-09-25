import type Database from 'better-sqlite3'
import type {
  BlockSentenceAttempt,
  BlockSentenceOutcome,
  BlockSentenceTrigger,
} from './block-sentence.types'

interface BlockSentenceAttemptRow {
  session_id: string
  turn_id: string
  first_item_id: string
  last_item_id: string
  trigger: BlockSentenceTrigger
  outcome: BlockSentenceOutcome
  refused_text: string | null
  reasons: string | null
  queued_at: string
  started_at: string
  finished_at: string
}

function fromRow(row: BlockSentenceAttemptRow): BlockSentenceAttempt {
  return {
    sessionId: row.session_id,
    turnId: row.turn_id,
    firstItemId: row.first_item_id,
    lastItemId: row.last_item_id,
    trigger: row.trigger,
    outcome: row.outcome,
    refusedText: row.refused_text,
    reasons: row.reasons,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

/**
 * The `conversation_block_sentence_attempts` rows (MAR-3422 CV3d R3): one per
 * request made. Written by the block-sentence service; read by it only to
 * learn that a block's line was refused, and by diagnostics.
 */
export class BlockSentenceAttemptRepository {
  constructor(private readonly db: Database.Database) {}

  insert(row: BlockSentenceAttempt): void {
    this.db
      .prepare(
        `INSERT INTO conversation_block_sentence_attempts
           (session_id, turn_id, first_item_id, last_item_id, trigger, outcome,
            refused_text, reasons, queued_at, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.sessionId,
        row.turnId,
        row.firstItemId,
        row.lastItemId,
        row.trigger,
        row.outcome,
        row.refusedText,
        row.reasons,
        row.queuedAt,
        row.startedAt,
        row.finishedAt,
      )
  }

  /** Whether the gate already refused a line for this block (R2). */
  hasRefusal(sessionId: string, firstItemId: string): boolean {
    return Boolean(
      this.db
        .prepare(
          `SELECT 1 FROM conversation_block_sentence_attempts
           WHERE session_id = ? AND first_item_id = ? AND outcome = 'refused'`,
        )
        .get(sessionId, firstItemId),
    )
  }

  list(sessionId: string): BlockSentenceAttempt[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM conversation_block_sentence_attempts
           WHERE session_id = ? ORDER BY id ASC`,
        )
        .all(sessionId) as BlockSentenceAttemptRow[]
    ).map(fromRow)
  }
}
