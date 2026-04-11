import { describe, expect, it, afterEach } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from './database'

describe('database', () => {
  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('creates an in-memory database with schema', () => {
    const db = getDatabase()
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[]

    const tableNames = tables.map((t) => t.name)
    expect(tableNames).toContain('projects')
    expect(tableNames).toContain('app_state')
  })

  it('returns the same instance on repeated calls', () => {
    const db1 = getDatabase()
    const db2 = getDatabase()
    expect(db1).toBe(db2)
  })

  it('can insert and read from projects table', () => {
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('1', 'test', '/tmp/test')",
    ).run()

    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get('1') as {
      name: string
    }
    expect(row.name).toBe('test')
  })

  it('enforces unique repository_path', () => {
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('1', 'test', '/tmp/test')",
    ).run()

    expect(() =>
      db
        .prepare(
          "INSERT INTO projects (id, name, repository_path) VALUES ('2', 'test2', '/tmp/test')",
        )
        .run(),
    ).toThrow()
  })
})
