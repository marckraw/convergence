import Database from 'better-sqlite3'
import type { TranscriptEntry } from '../provider/provider.types'
import { conversationItemToInsertRow } from '../session/conversation-item.pure'
import { migrateTranscriptToConversationItems } from '../session/conversation-item.pure'

function buildSessionsTableSql(
  tableName: string,
  includeIfNotExists = true,
): string {
  const ifNotExistsClause = includeIfNotExists ? 'IF NOT EXISTS ' : ''

  return `
    CREATE TABLE ${ifNotExistsClause}${tableName} (
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
      context_window TEXT,
      activity TEXT,
      archived_at TEXT,
      last_sequence INTEGER NOT NULL DEFAULT 0,
      conversation_version INTEGER NOT NULL DEFAULT 2,
      name_auto_generated INTEGER NOT NULL DEFAULT 0,
      parent_session_id TEXT,
      fork_strategy TEXT,
      primary_surface TEXT NOT NULL DEFAULT 'conversation',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );
  `
}

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

  ${buildSessionsTableSql('sessions')}

  CREATE TABLE IF NOT EXISTS session_conversation_items (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    turn_id TEXT,
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    provider_item_id TEXT,
    provider_event_type TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE (session_id, sequence)
  );

  CREATE INDEX IF NOT EXISTS idx_session_conversation_items_session_sequence
    ON session_conversation_items(session_id, sequence);

  CREATE TABLE IF NOT EXISTS session_queued_inputs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    delivery_mode TEXT NOT NULL,
    state TEXT NOT NULL,
    text TEXT NOT NULL,
    attachment_ids_json TEXT NOT NULL DEFAULT '[]',
    skill_selections_json TEXT NOT NULL DEFAULT '[]',
    provider_request_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_session_queued_inputs_session
    ON session_queued_inputs(session_id, state, created_at);

  CREATE TABLE IF NOT EXISTS session_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    summary TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE (session_id, sequence)
  );

  CREATE INDEX IF NOT EXISTS idx_session_turns_session_sequence
    ON session_turns(session_id, sequence);

  CREATE TABLE IF NOT EXISTS session_turn_file_changes (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    old_path TEXT,
    status TEXT NOT NULL,
    additions INTEGER NOT NULL DEFAULT 0,
    deletions INTEGER NOT NULL DEFAULT 0,
    diff TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (turn_id) REFERENCES session_turns(id) ON DELETE CASCADE,
    UNIQUE (turn_id, file_path)
  );

  CREATE INDEX IF NOT EXISTS idx_session_turn_file_changes_session_turn
    ON session_turn_file_changes(session_id, turn_id);

  CREATE TABLE IF NOT EXISTS initiatives (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'exploring',
    attention TEXT NOT NULL DEFAULT 'none',
    current_understanding TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS initiative_attempts (
    id TEXT PRIMARY KEY,
    initiative_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'exploration',
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE (initiative_id, session_id)
  );

  CREATE INDEX IF NOT EXISTS idx_initiative_attempts_initiative
    ON initiative_attempts(initiative_id);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_initiative_attempts_one_primary
    ON initiative_attempts(initiative_id)
    WHERE is_primary = 1;

  CREATE TABLE IF NOT EXISTS initiative_outputs (
    id TEXT PRIMARY KEY,
    initiative_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    source_session_id TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE,
    FOREIGN KEY (source_session_id) REFERENCES sessions(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_initiative_outputs_initiative
    ON initiative_outputs(initiative_id);

  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    path TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'worktree',
    archived_at TEXT,
    worktree_removed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, branch_name),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS workspace_pull_requests (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'unknown',
    lookup_status TEXT NOT NULL DEFAULT 'error',
    state TEXT NOT NULL DEFAULT 'unknown',
    repository_owner TEXT,
    repository_name TEXT,
    number INTEGER,
    title TEXT,
    url TEXT,
    is_draft INTEGER NOT NULL DEFAULT 0,
    head_branch TEXT,
    base_branch TEXT,
    merged_at TEXT,
    last_checked_at TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_workspace_pull_requests_project
    ON workspace_pull_requests(project_id);

  CREATE TABLE IF NOT EXISTS review_notes (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    workspace_id TEXT,
    file_path TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('working-tree', 'base-branch')),
    old_start_line INTEGER,
    old_end_line INTEGER,
    new_start_line INTEGER,
    new_end_line INTEGER,
    hunk_header TEXT,
    selected_diff TEXT NOT NULL,
    body TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'sent', 'resolved')),
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_review_notes_session_state_created
    ON review_notes(session_id, state, created_at);

  CREATE INDEX IF NOT EXISTS idx_review_notes_session_file
    ON review_notes(session_id, file_path);

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

  CREATE TABLE IF NOT EXISTS session_terminal_layout (
    session_id TEXT PRIMARY KEY,
    layout_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_context_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    label TEXT,
    body TEXT NOT NULL,
    reinject_mode TEXT NOT NULL CHECK (reinject_mode IN ('boot', 'every-turn')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_project_context_items_project
    ON project_context_items(project_id);

  CREATE TABLE IF NOT EXISTS session_context_attachments (
    session_id TEXT NOT NULL,
    context_item_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, context_item_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (context_item_id) REFERENCES project_context_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_session_context_attachments_session
    ON session_context_attachments(session_id);

  CREATE TABLE IF NOT EXISTS analytics_profile_snapshots (
    id TEXT PRIMARY KEY,
    range_preset TEXT NOT NULL,
    range_start_date TEXT,
    range_end_date TEXT NOT NULL,
    provider_id TEXT,
    model TEXT,
    profile_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_analytics_profile_snapshots_range_created
    ON analytics_profile_snapshots(range_preset, created_at DESC);
`

function ensureAttachmentsTableNoFk(database: Database.Database): void {
  // Drafts live under a sentinel session id before the real session exists, so
  // the attachments table must not FK to sessions(id). Detect the FK from
  // SQLite metadata instead of parsing CREATE TABLE SQL, which can vary across
  // older databases and quoted schemas.
  const foreignKeys = database
    .prepare("PRAGMA foreign_key_list('attachments')")
    .all() as Array<{ table: string }>

  if (!foreignKeys.some((fk) => fk.table === 'sessions')) return

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

function getTableColumnNames(
  database: Database.Database,
  tableName: string,
): Set<string> {
  const columns = database
    .prepare(`PRAGMA table_info('${tableName}')`)
    .all() as Array<{ name: string }>

  return new Set(columns.map((column) => column.name))
}

function hasLegacyTranscriptColumn(database: Database.Database): boolean {
  return getTableColumnNames(database, 'sessions').has('transcript')
}

function ensureWorkspaceColumns(database: Database.Database): void {
  const columnNames = getTableColumnNames(database, 'workspaces')

  if (!columnNames.has('archived_at')) {
    database.exec('ALTER TABLE workspaces ADD COLUMN archived_at TEXT')
  }

  if (!columnNames.has('worktree_removed_at')) {
    database.exec('ALTER TABLE workspaces ADD COLUMN worktree_removed_at TEXT')
  }
}

function ensureSessionColumns(database: Database.Database): void {
  const columnNames = getTableColumnNames(database, 'sessions')

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

  if (!columnNames.has('last_sequence')) {
    database.exec(
      'ALTER TABLE sessions ADD COLUMN last_sequence INTEGER NOT NULL DEFAULT 0',
    )
  }

  if (!columnNames.has('conversation_version')) {
    database.exec(
      'ALTER TABLE sessions ADD COLUMN conversation_version INTEGER NOT NULL DEFAULT 2',
    )
  }

  if (!columnNames.has('name_auto_generated')) {
    database.exec(
      'ALTER TABLE sessions ADD COLUMN name_auto_generated INTEGER NOT NULL DEFAULT 0',
    )
  }

  if (!columnNames.has('parent_session_id')) {
    database.exec('ALTER TABLE sessions ADD COLUMN parent_session_id TEXT')
  }

  if (!columnNames.has('fork_strategy')) {
    database.exec('ALTER TABLE sessions ADD COLUMN fork_strategy TEXT')
  }

  if (!columnNames.has('primary_surface')) {
    database.exec(
      "ALTER TABLE sessions ADD COLUMN primary_surface TEXT NOT NULL DEFAULT 'conversation'",
    )
  }
}

function parseLegacyTranscript(
  sessionId: string,
  value: string,
): TranscriptEntry[] {
  let parsed: unknown

  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    throw new Error(
      `Cannot drop legacy transcript storage: session ${sessionId} transcript is invalid JSON`,
    )
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `Cannot drop legacy transcript storage: session ${sessionId} transcript is not an array`,
    )
  }

  return parsed as TranscriptEntry[]
}

function migrateLegacySessionConversations(database: Database.Database): void {
  if (!hasLegacyTranscriptColumn(database)) return

  const sessions = database
    .prepare(
      'SELECT id, provider_id, transcript FROM sessions ORDER BY created_at ASC',
    )
    .all() as Array<{
    id: string
    provider_id: string
    transcript: string
  }>

  const itemCountStmt = database.prepare(
    'SELECT COUNT(*) as count FROM session_conversation_items WHERE session_id = ?',
  )
  const maxSequenceStmt = database.prepare(
    'SELECT MAX(sequence) as sequence FROM session_conversation_items WHERE session_id = ?',
  )
  const insertItemStmt = database.prepare(`
    INSERT INTO session_conversation_items (
      id,
      session_id,
      sequence,
      turn_id,
      kind,
      state,
      payload_json,
      provider_item_id,
      provider_event_type,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const updateSessionStmt = database.prepare(`
    UPDATE sessions
    SET last_sequence = ?, conversation_version = 2
    WHERE id = ?
  `)

  const migrateOne = database.transaction(
    (sessionId: string, providerId: string, transcript: string) => {
      const existingCount = (
        itemCountStmt.get(sessionId) as { count: number } | undefined
      )?.count

      if ((existingCount ?? 0) > 0) {
        const maxSequence = (
          maxSequenceStmt.get(sessionId) as
            | { sequence: number | null }
            | undefined
        )?.sequence
        updateSessionStmt.run(maxSequence ?? 0, sessionId)
        return
      }

      const items = migrateTranscriptToConversationItems({
        sessionId,
        providerId,
        entries: parseLegacyTranscript(sessionId, transcript),
      })

      for (const item of items) {
        const row = conversationItemToInsertRow(item)
        insertItemStmt.run(
          row.id,
          row.sessionId,
          row.sequence,
          row.turnId,
          row.kind,
          row.state,
          row.payloadJson,
          row.providerItemId,
          row.providerEventType,
          row.createdAt,
          row.updatedAt,
        )
      }

      updateSessionStmt.run(items.length, sessionId)
    },
  )

  for (const session of sessions) {
    migrateOne(session.id, session.provider_id, session.transcript)
  }
}

function ensureLegacyTranscriptCoverage(database: Database.Database): void {
  if (!hasLegacyTranscriptColumn(database)) return

  const sessions = database
    .prepare(
      'SELECT id, transcript, last_sequence FROM sessions ORDER BY created_at ASC',
    )
    .all() as Array<{
    id: string
    transcript: string
    last_sequence: number
  }>
  const sequenceStatsStmt = database.prepare(`
    SELECT COUNT(*) as count, MAX(sequence) as max_sequence
    FROM session_conversation_items
    WHERE session_id = ?
  `)

  for (const session of sessions) {
    const stats = sequenceStatsStmt.get(session.id) as
      | { count: number; max_sequence: number | null }
      | undefined
    const itemCount = stats?.count ?? 0
    const maxSequence = stats?.max_sequence ?? 0

    if (itemCount > 0) {
      if (maxSequence !== itemCount) {
        throw new Error(
          `Cannot drop legacy transcript storage: session ${session.id} has non-contiguous normalized conversation rows`,
        )
      }

      if ((session.last_sequence ?? 0) !== maxSequence) {
        throw new Error(
          `Cannot drop legacy transcript storage: session ${session.id} has inconsistent last_sequence metadata`,
        )
      }

      continue
    }

    const entries = parseLegacyTranscript(session.id, session.transcript)
    if (entries.length === 0) continue

    throw new Error(
      `Cannot drop legacy transcript storage: session ${session.id} is missing normalized conversation rows`,
    )
  }
}

function ensureSessionsTableWithoutTranscript(
  database: Database.Database,
): void {
  if (!hasLegacyTranscriptColumn(database)) return

  ensureLegacyTranscriptCoverage(database)

  const foreignKeysEnabled =
    (database.pragma('foreign_keys', { simple: true }) as number) === 1

  if (foreignKeysEnabled) {
    database.pragma('foreign_keys = OFF')
  }

  try {
    database.transaction(() => {
      database.exec('DROP TABLE IF EXISTS sessions_next')
      database.exec(buildSessionsTableSql('sessions_next', false))
      database.exec(`
        INSERT INTO sessions_next (
          id,
          project_id,
          workspace_id,
          provider_id,
          model,
          effort,
          continuation_token,
          name,
          status,
          attention,
          working_directory,
          context_window,
          activity,
          archived_at,
          last_sequence,
          conversation_version,
          name_auto_generated,
          parent_session_id,
          fork_strategy,
          primary_surface,
          created_at,
          updated_at
        )
        SELECT
          id,
          project_id,
          workspace_id,
          provider_id,
          model,
          effort,
          continuation_token,
          name,
          status,
          attention,
          working_directory,
          context_window,
          activity,
          archived_at,
          last_sequence,
          conversation_version,
          name_auto_generated,
          CASE
            WHEN parent_session_id IN (SELECT id FROM sessions)
              THEN parent_session_id
            ELSE NULL
          END,
          fork_strategy,
          primary_surface,
          created_at,
          updated_at
        FROM sessions;
        DROP TABLE sessions;
        ALTER TABLE sessions_next RENAME TO sessions;
      `)

      const violations = database
        .prepare('PRAGMA foreign_key_check')
        .all() as Array<Record<string, unknown>>

      if (violations.length > 0) {
        throw new Error(
          'Failed to rebuild sessions table without legacy transcript column: foreign key check failed',
        )
      }
    })()
  } finally {
    if (foreignKeysEnabled) {
      database.pragma('foreign_keys = ON')
    }
  }
}

export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db

  const database = new Database(dbPath ?? ':memory:')

  try {
    database.pragma('journal_mode = WAL')
    database.pragma('foreign_keys = ON')
    database.exec(SCHEMA)
    ensureWorkspaceColumns(database)
    ensureSessionColumns(database)
    ensureAttachmentsTableNoFk(database)
    migrateLegacySessionConversations(database)
    ensureSessionsTableWithoutTranscript(database)
  } catch (error) {
    database.close()
    throw error
  }

  db = database
  return database
}

export { ensureAttachmentsTableNoFk }

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function resetDatabase(): void {
  db = null
}
