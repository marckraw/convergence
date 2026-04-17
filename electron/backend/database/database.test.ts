import { describe, expect, it, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
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

  it('migrates a legacy attachments table that still references sessions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'convergence-db-test-'))
    const dbPath = join(dir, 'legacy.sqlite')

    try {
      const legacy = new Database(dbPath)
      legacy.pragma('foreign_keys = ON')
      legacy.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          repository_path TEXT NOT NULL UNIQUE,
          settings TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE workspaces (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          path TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'worktree',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(project_id, branch_name),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          workspace_id TEXT,
          provider_id TEXT NOT NULL,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'idle',
          attention TEXT NOT NULL DEFAULT 'none',
          working_directory TEXT NOT NULL,
          transcript TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE attachments (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          filename TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          storage_path TEXT NOT NULL,
          thumbnail_path TEXT,
          text_preview TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const foreignKeys = db
        .prepare("PRAGMA foreign_key_list('attachments')")
        .all() as Array<{ table: string }>

      expect(foreignKeys.some((fk) => fk.table === 'sessions')).toBe(false)
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
