import Database from 'better-sqlite3'
import { expect, it, vi } from 'vitest'
import { migrateEndedSummary } from './ended-summary-migration.service'

function fixture() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE session_agent_runs(id TEXT);
    CREATE TABLE session_tasks(id TEXT);
    INSERT INTO session_agent_runs VALUES ('old-agent');
    INSERT INTO session_tasks VALUES ('old-task');`)
  return db
}

it('R11 adds nullable summaries once without backfill — mutation omit either ALTER or backfill a reason turns red', () => {
  const db = fixture()
  try {
    migrateEndedSummary(db)
    migrateEndedSummary(db)
    expect({
      agent: db.prepare('SELECT * FROM session_agent_runs').get(),
      task: db.prepare('SELECT * FROM session_tasks').get(),
      marker: db.prepare('SELECT * FROM app_state').all(),
    }).toEqual({
      agent: { id: 'old-agent', ended_summary: null },
      task: { id: 'old-task', ended_summary: null },
      marker: [{ key: 'cc2_ended_summary_v1', value: '1' }],
    })
  } finally {
    db.close()
  }
})

it('R11 rolls both columns and marker back on interruption — mutation remove transaction turns red', () => {
  const db = fixture()
  const exec = db.exec.bind(db)
  const spy = vi.spyOn(db, 'exec').mockImplementation((sql) => {
    if (sql.includes('ALTER TABLE session_tasks'))
      throw new Error('interrupted')
    return exec(sql)
  })
  let failure: unknown
  try {
    migrateEndedSummary(db)
  } catch (error) {
    failure = error
  }
  spy.mockRestore()
  try {
    expect({
      failure: failure instanceof Error ? failure.message : null,
      agent: db.prepare('SELECT * FROM session_agent_runs').get(),
      task: db.prepare('SELECT * FROM session_tasks').get(),
      marker: db.prepare('SELECT * FROM app_state').all(),
    }).toEqual({
      failure: 'interrupted',
      agent: { id: 'old-agent' },
      task: { id: 'old-task' },
      marker: [],
    })
  } finally {
    db.close()
  }
})
