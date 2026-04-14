import Database from 'better-sqlite3'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repository_path TEXT NOT NULL UNIQUE,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    workspace_id TEXT,
    provider_id TEXT NOT NULL,
    model TEXT,
    effort TEXT,
    continuation_token TEXT,
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

  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    path TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'worktree',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, branch_name),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`

let db: Database.Database | null = null

function ensureSessionColumns(database: Database.Database): void {
  const columns = database
    .prepare("PRAGMA table_info('sessions')")
    .all() as Array<{ name: string }>
  const columnNames = new Set(columns.map((column) => column.name))

  if (!columnNames.has('model')) {
    database.exec('ALTER TABLE sessions ADD COLUMN model TEXT')
  }

  if (!columnNames.has('effort')) {
    database.exec('ALTER TABLE sessions ADD COLUMN effort TEXT')
  }

  if (!columnNames.has('continuation_token')) {
    database.exec('ALTER TABLE sessions ADD COLUMN continuation_token TEXT')
  }
}

export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db

  db = new Database(dbPath ?? ':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  ensureSessionColumns(db)

  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function resetDatabase(): void {
  db = null
}
