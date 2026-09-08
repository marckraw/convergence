import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { migrateHarnessEvidence } from './harness-evidence-migration.service'

function oldDatabase() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY);
    CREATE TABLE session_conversation_items (id TEXT PRIMARY KEY);
    CREATE TABLE session_turns (id TEXT PRIMARY KEY);
    INSERT INTO session_conversation_items VALUES ('old-item');
    INSERT INTO session_turns VALUES ('old-turn');`)
  return db
}

describe('CC2 evidence migration', () => {
  it('adds nullable evidence without backfill — omit a column/table or invent old identity turns red', () => {
    const db = oldDatabase()
    try {
      migrateHarnessEvidence(db)
      migrateHarnessEvidence(db)
      expect({
        item: db.prepare('SELECT * FROM session_conversation_items').get(),
        turn: db.prepare('SELECT * FROM session_turns').get(),
        tables: db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('session_agent_runs','session_tasks','session_harness_events') ORDER BY name",
          )
          .all(),
      }).toEqual({
        item: { id: 'old-item', agent_run_id: null, task_id: null },
        turn: {
          id: 'old-turn',
          result_subtype: null,
          usage_json: null,
          cost_usd: null,
          permission_denials_json: null,
          subagent_stats_json: null,
        },
        tables: [
          { name: 'session_agent_runs' },
          { name: 'session_harness_events' },
          { name: 'session_tasks' },
        ],
      })
    } finally {
      db.close()
    }
  })
  it('rolls back work and marker together — remove the migration transaction turns red at the interrupted CREATE seam', () => {
    const db = oldDatabase()
    const exec = db.exec.bind(db)
    const spy = vi.spyOn(db, 'exec').mockImplementation((sql) => {
      if (sql.includes('CREATE TABLE session_tasks'))
        throw new Error('interrupted migration')
      return exec(sql)
    })
    let error: unknown
    try {
      migrateHarnessEvidence(db)
    } catch (caught) {
      error = caught
    }
    spy.mockRestore()
    try {
      expect({
        error: error instanceof Error ? error.message : null,
        columns: db
          .prepare('PRAGMA table_info(session_conversation_items)')
          .all()
          .map((row) => (row as { name: string }).name),
        marker: db
          .prepare("SELECT value FROM app_state WHERE key='cc2_evidence_v1'")
          .get(),
        agentTable: db
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='session_agent_runs'",
          )
          .get(),
      }).toEqual({
        error: 'interrupted migration',
        columns: ['id'],
        marker: undefined,
        agentTable: undefined,
      })
    } finally {
      db.close()
    }
  })
})
