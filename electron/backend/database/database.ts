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
    context_window TEXT,
    activity TEXT,
    archived_at TEXT,
    name_auto_generated INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    text_preview TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_attachments_session ON attachments(session_id);
`

function ensureAttachmentsTableNoFk(database: Database.Database): void {
  // Drafts live under a sentinel session id before the real session exists, so
  // the attachments table must not FK to sessions(id). If an older schema with
  // the FK is present, rebuild without it.
  const row = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='attachments'",
    )
    .get() as { sql: string } | undefined

  if (!row) return
  if (!/FOREIGN\s+KEY[^)]*REFERENCES\s+sessions/i.test(row.sql)) return

  database.exec(`
    DROP INDEX IF EXISTS idx_attachments_session;
    ALTER TABLE attachments RENAME TO attachments_old;
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO attachments (
      id, session_id, kind, mime_type, filename, size_bytes,
      storage_path, thumbnail_path, text_preview, created_at
    )
    SELECT id, session_id, kind, mime_type, filename, size_bytes,
           storage_path, thumbnail_path, text_preview, created_at
    FROM attachments_old;
    DROP TABLE attachments_old;
    CREATE INDEX IF NOT EXISTS idx_attachments_session ON attachments(session_id);
  `)
}

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

  if (!columnNames.has('context_window')) {
    database.exec('ALTER TABLE sessions ADD COLUMN context_window TEXT')
  }

  if (!columnNames.has('activity')) {
    database.exec('ALTER TABLE sessions ADD COLUMN activity TEXT')
  }

  if (!columnNames.has('archived_at')) {
    database.exec('ALTER TABLE sessions ADD COLUMN archived_at TEXT')
  }

  if (!columnNames.has('name_auto_generated')) {
    database.exec(
      'ALTER TABLE sessions ADD COLUMN name_auto_generated INTEGER NOT NULL DEFAULT 0',
    )
  }
}

export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db

  db = new Database(dbPath ?? ':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  ensureSessionColumns(db)
  ensureAttachmentsTableNoFk(db)

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
