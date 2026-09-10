import Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import { migrateTaskObserved } from './task-observed-migration.service'

it('RUN64 R2′ backfills only known times once — mutation drop COALESCE or overwrite sightings turns red', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE session_tasks(task_id TEXT,started_at TEXT,ended_at TEXT);
      INSERT INTO session_tasks VALUES ('start','a','b'),('end',NULL,'c'),('unknown',NULL,NULL);`)
    migrateTaskObserved(db)
    migrateTaskObserved(db)
    expect(db.prepare('SELECT * FROM session_tasks').all()).toEqual([
      { task_id: 'start', started_at: 'a', ended_at: 'b', observed_at: 'a' },
      { task_id: 'end', started_at: null, ended_at: 'c', observed_at: 'c' },
      {
        task_id: 'unknown',
        started_at: null,
        ended_at: null,
        observed_at: null,
      },
    ])
  } finally {
    db.close()
  }
})
