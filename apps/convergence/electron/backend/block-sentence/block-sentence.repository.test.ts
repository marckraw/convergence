import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import {
  BLOCK_SENTENCES_MIGRATION_KEY,
  migrateBlockSentences,
} from './block-sentence-migration.service'
import { BlockSentenceRepository } from './block-sentence.repository'

function bareDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY);
    INSERT INTO sessions (id) VALUES ('s1'), ('s2');`)
  return db
}

const row = (firstItemId: string, sentence = 'Read three files.') => ({
  sessionId: 's1',
  firstItemId,
  lastItemId: `${firstItemId}-last`,
  sentence,
  model: 'gpt-6-luna',
  createdAt: `2026-09-25T12:00:0${firstItemId.length}.000Z`,
})

describe('the block-sentence table (R4)', () => {
  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('is built by the app database at start', () => {
    const db = getDatabase()
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_block_sentences'",
        )
        .get(),
    ).toEqual({ name: 'conversation_block_sentences' })
    expect(
      db
        .prepare('SELECT value FROM app_state WHERE key = ?')
        .get(BLOCK_SENTENCES_MIGRATION_KEY),
    ).toEqual({ value: '1' })
  })

  it('migrates once: a second run keeps the rows', () => {
    const db = bareDatabase()
    try {
      migrateBlockSentences(db)
      new BlockSentenceRepository(db).insert(row('a'))
      migrateBlockSentences(db)
      expect(new BlockSentenceRepository(db).list('s1')).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it('leaves neither table nor marker when the marker write is refused', () => {
    const db = bareDatabase()
    try {
      db.exec(
        "CREATE TRIGGER refuse BEFORE INSERT ON app_state BEGIN SELECT RAISE(ABORT, 'refused'); END",
      )
      expect(() => migrateBlockSentences(db)).toThrow('refused')
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='conversation_block_sentences'",
          )
          .get(),
      ).toBeUndefined()
      db.exec('DROP TRIGGER refuse')
      migrateBlockSentences(db)
      expect(new BlockSentenceRepository(db).list('s1')).toEqual([])
    } finally {
      db.close()
    }
  })

  it('lists what was stored, per session; the first sentence for a block wins', () => {
    const db = bareDatabase()
    try {
      migrateBlockSentences(db)
      const repository = new BlockSentenceRepository(db)
      expect(repository.insert(row('a'))).toBe(true)
      expect(repository.insert(row('bb'))).toBe(true)
      expect(repository.insert(row('a', 'A second line.'))).toBe(false)
      expect(repository.insert({ ...row('c'), sessionId: 's2' })).toBe(true)
      expect(repository.list('s1')).toEqual([row('a'), row('bb')])
      expect(repository.has('s1', 'a')).toBe(true)
      expect(repository.has('s1', 'c')).toBe(false)
    } finally {
      db.close()
    }
  })

  it('goes with its session', () => {
    const db = bareDatabase()
    try {
      migrateBlockSentences(db)
      const repository = new BlockSentenceRepository(db)
      repository.insert(row('a'))
      db.prepare("DELETE FROM sessions WHERE id = 's1'").run()
      expect(repository.list('s1')).toEqual([])
    } finally {
      db.close()
    }
  })
})
