import Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import { migrateReleaseActs } from './release-act-migration.service'

it('MAR-3087 migration rolls back on sentinel failure, then preserves acts across a second call', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER refuse BEFORE INSERT ON app_state BEGIN SELECT RAISE(ABORT, 'refused'); END`)
    expect(() => migrateReleaseActs(db)).toThrow('refused')
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name='release_acts'")
        .get(),
    ).toBeUndefined()
    db.exec('DROP TRIGGER refuse')
    migrateReleaseActs(db)
    const insert =
      db.prepare(`INSERT INTO release_acts(id,crew_id,kind,issue_id,pr_number,head_sha,requested_at,outcome)
      VALUES ('act','crew',?,'issue',1,'sha','now',?)`)
    expect(() => insert.run('release', 'pending')).toThrow('CHECK')
    expect(() => insert.run('merge', 'unknown')).toThrow('CHECK')
    insert.run('merge', 'pending')
    migrateReleaseActs(db)
    expect(db.prepare('SELECT count(*) AS n FROM release_acts').get()).toEqual({
      n: 1,
    })
    expect(
      db
        .prepare("SELECT value FROM app_state WHERE key='release_acts_v1'")
        .get(),
    ).toEqual({ value: '1' })
  } finally {
    db.close()
  }
})
