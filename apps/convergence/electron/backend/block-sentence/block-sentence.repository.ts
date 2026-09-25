import type Database from 'better-sqlite3'
import type { BlockSentence } from './block-sentence.types'

interface BlockSentenceRow {
  session_id: string
  first_item_id: string
  last_item_id: string
  sentence: string
  model: string
  created_at: string
}

function fromRow(row: BlockSentenceRow): BlockSentence {
  return {
    sessionId: row.session_id,
    firstItemId: row.first_item_id,
    lastItemId: row.last_item_id,
    sentence: row.sentence,
    model: row.model,
    createdAt: row.created_at,
  }
}

/** The `conversation_block_sentences` rows (R4). */
export class BlockSentenceRepository {
  constructor(private readonly db: Database.Database) {}

  list(sessionId: string): BlockSentence[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM conversation_block_sentences
           WHERE session_id = ? ORDER BY created_at ASC, first_item_id ASC`,
        )
        .all(sessionId) as BlockSentenceRow[]
    ).map(fromRow)
  }

  has(sessionId: string, firstItemId: string): boolean {
    return Boolean(
      this.db
        .prepare(
          'SELECT 1 FROM conversation_block_sentences WHERE session_id = ? AND first_item_id = ?',
        )
        .get(sessionId, firstItemId),
    )
  }

  /**
   * One small statement (A5). The first sentence for a block wins: a block
   * is described once, never rewritten.
   */
  insert(row: BlockSentence): boolean {
    return (
      this.db
        .prepare(
          `INSERT OR IGNORE INTO conversation_block_sentences
             (session_id, first_item_id, last_item_id, sentence, model, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.sessionId,
          row.firstItemId,
          row.lastItemId,
          row.sentence,
          row.model,
          row.createdAt,
        ).changes > 0
    )
  }
}
