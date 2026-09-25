import type Database from 'better-sqlite3'

export const BLOCK_SENTENCES_MIGRATION_KEY = 'conversation_block_sentences_v1'

/**
 * The block-sentence table (MAR-3395 R4), by the `app_state` marker pattern:
 * the table and its marker land in one transaction, so an interrupted start
 * leaves neither and the next start builds both.
 */
export function migrateBlockSentences(db: Database.Database): void {
  if (
    db
      .prepare('SELECT 1 FROM app_state WHERE key = ?')
      .get(BLOCK_SENTENCES_MIGRATION_KEY)
  )
    return
  db.transaction(() => {
    db.prepare(
      `CREATE TABLE conversation_block_sentences (
        session_id TEXT NOT NULL,
        first_item_id TEXT NOT NULL,
        last_item_id TEXT NOT NULL,
        sentence TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (session_id, first_item_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )`,
    ).run()
    db.prepare("INSERT INTO app_state(key, value) VALUES (?, '1')").run(
      BLOCK_SENTENCES_MIGRATION_KEY,
    )
  })()
}
