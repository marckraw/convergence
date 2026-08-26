import Database from 'better-sqlite3'
import { APP_SETTINGS_KEY } from '../app-settings/app-settings.constants'
import {
  DEFAULT_EXECUTION_HOST_ENDPOINT_ID,
  DEFAULT_EXECUTION_HOST_ENDPOINT_LABEL,
  LEGACY_REMOTE_EXECUTION_HOST_ID,
  normalizeExecutionHostBaseUrl,
} from '../execution-host-endpoint/execution-host-endpoint.pure'
import type { TranscriptEntry } from '../provider/provider.types'
import { conversationItemToInsertRow } from '../session/conversation-item.pure'
import { migrateTranscriptToConversationItems } from '../session/conversation-item.pure'
import { isBinaryDiff } from '../session/turn/turn.pure'
import {
  TURN_BINARY_DIFF_MARKER,
  TURN_DIFF_TRUNCATION_MARKER_PREFIX,
} from '../session/turn/turn.types'

function buildSessionsTableSql(
  tableName: string,
  includeIfNotExists = true,
): string {
  const ifNotExistsClause = includeIfNotExists ? 'IF NOT EXISTS ' : ''

  return `
    CREATE TABLE ${ifNotExistsClause}${tableName} (
      id TEXT PRIMARY KEY,
      context_kind TEXT NOT NULL DEFAULT 'project'
        CHECK (context_kind IN ('project', 'global')),
      project_id TEXT,
      workspace_id TEXT,
      provider_id TEXT NOT NULL,
      model TEXT,
      effort TEXT,
      service_tier TEXT,
      permission_config TEXT NOT NULL DEFAULT '{"preset":"ask"}',
      continuation_token TEXT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      attention TEXT NOT NULL DEFAULT 'none',
      working_directory TEXT NOT NULL,
      context_window TEXT,
      activity TEXT,
      relays_muted INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      last_sequence INTEGER NOT NULL DEFAULT 0,
      conversation_version INTEGER NOT NULL DEFAULT 2,
      name_auto_generated INTEGER NOT NULL DEFAULT 0,
      parent_session_id TEXT,
      fork_strategy TEXT,
      primary_surface TEXT NOT NULL DEFAULT 'conversation',
      execution_host TEXT NOT NULL DEFAULT 'local',
      execution_host_last_seq INTEGER NOT NULL DEFAULT 0,
      execution_host_settled_seq INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE SET NULL,
      CHECK (
        (context_kind = 'project' AND project_id IS NOT NULL)
        OR
        (context_kind = 'global' AND project_id IS NULL AND workspace_id IS NULL)
      )
    );
  `
}

/**
 * The columns of `session_turn_file_changes`, in the order the rebuild copies
 * them. Named once because the rebuild's `INSERT ... SELECT` has to project
 * exactly what the new table declares, and a list that drifts from the table
 * beside it is how a rebuild loses a column's contents in silence.
 */
const TURN_FILE_CHANGE_COLUMNS = [
  'id',
  'session_id',
  'turn_id',
  'repo_root',
  'file_path',
  'old_path',
  'status',
  'additions',
  'deletions',
  'diff',
  'truncated',
  'binary',
  'created_at',
] as const

/**
 * A file change's identity is `(turn, repository, path)` (MAR-2589).
 *
 * Deliberately no table-level `UNIQUE`: the constraint this table needs cannot
 * be written as one. `UNIQUE (turn_id, repo_root, file_path)` does not
 * constrain rows where `repo_root IS NULL` -- SQL treats two NULLs as distinct
 * -- and null is *every* row local capture has ever written, so the obvious
 * widening would quietly delete today's guarantee for the common case. The
 * identity lives in a unique expression index instead
 * (`ensureTurnFileChangeIdentity`), which folds null to `''` and therefore
 * holds for both.
 */
function buildTurnFileChangesTableSql(
  tableName: string,
  includeIfNotExists = true,
): string {
  const ifNotExistsClause = includeIfNotExists ? 'IF NOT EXISTS ' : ''

  return `
    CREATE TABLE ${ifNotExistsClause}${tableName} (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      repo_root TEXT,
      file_path TEXT NOT NULL,
      old_path TEXT,
      status TEXT NOT NULL,
      additions INTEGER NOT NULL DEFAULT 0,
      deletions INTEGER NOT NULL DEFAULT 0,
      diff TEXT NOT NULL,
      truncated INTEGER NOT NULL DEFAULT 0,
      binary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (turn_id) REFERENCES session_turns(id) ON DELETE CASCADE
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
    skip_context_injection INTEGER NOT NULL DEFAULT 0,
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

  ${buildTurnFileChangesTableSql('session_turn_file_changes')}

  CREATE INDEX IF NOT EXISTS idx_session_turn_file_changes_session_turn
    ON session_turn_file_changes(session_id, turn_id);

  CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'exploring',
    attention TEXT NOT NULL DEFAULT 'none',
    brief TEXT NOT NULL DEFAULT '',
    memory TEXT NOT NULL DEFAULT '',
    archived_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS space_attempts (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'exploration',
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE (space_id, session_id)
  );

  CREATE INDEX IF NOT EXISTS idx_space_attempts_space
    ON space_attempts(space_id);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_space_attempts_one_primary
    ON space_attempts(space_id)
    WHERE is_primary = 1;

  CREATE TABLE IF NOT EXISTS space_artifacts (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    source_session_id TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
    FOREIGN KEY (source_session_id) REFERENCES sessions(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_space_artifacts_space
    ON space_artifacts(space_id);

  CREATE TABLE IF NOT EXISTS space_sources (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_path TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_space_sources_space
    ON space_sources(space_id);

  CREATE TABLE IF NOT EXISTS session_crews (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT,
    accent_color TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Membership carries no foreign keys on purpose: a crew is a label, never an
  -- owner. Deleting a crew must never cascade into sessions, and a deleted
  -- session must never fail a crew read -- orphan rows are filtered on read.
  CREATE TABLE IF NOT EXISTS session_crew_members (
    crew_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (crew_id, session_id)
  );

  CREATE INDEX IF NOT EXISTS idx_session_crew_members_crew
    ON session_crew_members(crew_id);

  CREATE INDEX IF NOT EXISTS idx_session_crew_members_session
    ON session_crew_members(session_id);

  -- A relay is one wire inside a crew: when its source session settles, it
  -- carries that session's last assistant message somewhere. Like crew
  -- membership it declares no foreign keys -- a relay whose source or target
  -- was deleted must degrade to an unwireable row we can show and remove, never
  -- a cascade that deletes sessions or a read that crashes.
  CREATE TABLE IF NOT EXISTS session_relays (
    id TEXT PRIMARY KEY,
    crew_id TEXT NOT NULL,
    source_session_id TEXT NOT NULL,
    trigger TEXT NOT NULL DEFAULT 'settled',
    action TEXT NOT NULL,
    target_session_id TEXT,
    spawn_spec_json TEXT,
    instruction TEXT,
    opener TEXT,
    armed INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_session_relays_crew
    ON session_relays(crew_id);

  CREATE INDEX IF NOT EXISTS idx_session_relays_source
    ON session_relays(source_session_id);

  -- The ledger. Every firing writes exactly one row -- deliveries, spawns,
  -- skips and errors alike -- because a wire the user cannot watch fire is a
  -- silent hop, and silent hops are forbidden.
  CREATE TABLE IF NOT EXISTS relay_hops (
    id TEXT PRIMARY KEY,
    relay_id TEXT NOT NULL,
    crew_id TEXT NOT NULL,
    flow_run_id TEXT NOT NULL,
    fired_at TEXT NOT NULL DEFAULT (datetime('now')),
    source_session_id TEXT NOT NULL,
    target_session_id TEXT,
    spawned_session_id TEXT,
    trigger_status TEXT NOT NULL,
    payload_preview TEXT,
    outcome TEXT NOT NULL,
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_relay_hops_crew_fired
    ON relay_hops(crew_id, fired_at);

  CREATE INDEX IF NOT EXISTS idx_relay_hops_flow_run
    ON relay_hops(flow_run_id);

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

  CREATE TABLE IF NOT EXISTS project_scripts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'play',
    cwd TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_project_scripts_project
    ON project_scripts(project_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS project_script_runs (
    id TEXT PRIMARY KEY,
    script_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    command TEXT NOT NULL,
    cwd TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN ('queued', 'running', 'succeeded', 'failed', 'stopped')
    ),
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    exit_code INTEGER,
    signal TEXT,
    error_message TEXT,
    stdout TEXT NOT NULL DEFAULT '',
    stderr TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (script_id) REFERENCES project_scripts(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_project_script_runs_project_started
    ON project_script_runs(project_id, started_at DESC);

  CREATE INDEX IF NOT EXISTS idx_project_script_runs_script_started
    ON project_script_runs(script_id, started_at DESC);

  -- MAR-2609 excised code review from Convergence: nothing writes or reads
  -- review_notes or code_review_guides any more. Both tables stay because code
  -- is cheap to reverse and Marcin's data is not. MAR-2615 drops them once he
  -- confirms he does not want what is stored here.
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

  CREATE TABLE IF NOT EXISTS code_review_guides (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('working-tree', 'base-branch')),
    cache_key TEXT NOT NULL,
    cache_identity_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
    overview TEXT NOT NULL DEFAULT '',
    generated_by TEXT NOT NULL CHECK (generated_by IN ('deterministic', 'agent')),
    sections_json TEXT NOT NULL DEFAULT '[]',
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE (target_id, mode, cache_key)
  );

  CREATE INDEX IF NOT EXISTS idx_code_review_guides_project_target
    ON code_review_guides(project_id, target_id, mode, updated_at DESC);

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

  CREATE TABLE IF NOT EXISTS prompt_library_entries (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    scope TEXT NOT NULL CHECK (scope IN ('project', 'global')),
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CHECK (
      (scope = 'project' AND project_id IS NOT NULL)
      OR
      (scope = 'global' AND project_id IS NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_prompt_library_entries_project
    ON prompt_library_entries(project_id, scope);

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

  CREATE TABLE IF NOT EXISTS skill_catalog_cache (
    cache_key TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    scan_root TEXT NOT NULL,
    catalog_json TEXT NOT NULL,
    fingerprint TEXT,
    expires_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_skill_catalog_cache_provider
    ON skill_catalog_cache(provider_id);

  CREATE TABLE IF NOT EXISTS provider_accounts (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    label TEXT NOT NULL,
    auth_kind TEXT NOT NULL DEFAULT 'subscription-oauth'
      CHECK (auth_kind IN ('subscription-oauth', 'setup-token')),
    email TEXT,
    org_id TEXT,
    plan TEXT,
    config_dir TEXT NOT NULL UNIQUE,
    credential_dir TEXT NOT NULL UNIQUE,
    execution_host_id TEXT NOT NULL DEFAULT 'local',
    is_default INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'connected'
      CHECK (status IN ('connected', 'expired', 'unavailable')),
    last_validated_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider_host
    ON provider_accounts(provider_id, execution_host_id);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_accounts_single_default
    ON provider_accounts(provider_id, execution_host_id)
    WHERE is_default = 1;
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

function getTableInfo(
  database: Database.Database,
  tableName: string,
): Array<{ name: string; notnull: number }> {
  return database.prepare(`PRAGMA table_info('${tableName}')`).all() as Array<{
    name: string
    notnull: number
  }>
}

function getTableCreateSql(
  database: Database.Database,
  tableName: string,
): string {
  const row = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(tableName) as { sql: string } | undefined

  return row?.sql ?? ''
}

function hasLegacyTranscriptColumn(database: Database.Database): boolean {
  return getTableColumnNames(database, 'sessions').has('transcript')
}

function needsSessionContextShapeMigration(
  database: Database.Database,
): boolean {
  const columns = getTableInfo(database, 'sessions')
  const columnNames = new Set(columns.map((column) => column.name))
  const projectIdColumn = columns.find((column) => column.name === 'project_id')
  const createSql = getTableCreateSql(database, 'sessions')

  return (
    !columnNames.has('context_kind') ||
    projectIdColumn?.notnull === 1 ||
    !createSql.includes("context_kind IN ('project', 'global')")
  )
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

function ensureSpaceColumns(database: Database.Database): void {
  const columnNames = getTableColumnNames(database, 'spaces')

  if (!columnNames.has('memory')) {
    database.exec(
      "ALTER TABLE spaces ADD COLUMN memory TEXT NOT NULL DEFAULT ''",
    )
  }

  if (!columnNames.has('archived_at')) {
    database.exec('ALTER TABLE spaces ADD COLUMN archived_at TEXT')
  }
}

function ensureProjectScriptColumns(database: Database.Database): void {
  const columnNames = getTableColumnNames(database, 'project_scripts')

  if (!columnNames.has('icon')) {
    database.exec(
      "ALTER TABLE project_scripts ADD COLUMN icon TEXT NOT NULL DEFAULT 'play'",
    )
  }
}

/**
 * The two texts a wire carries besides the message: the standing instruction it
 * prepends (F7) and the opener it sends ahead of the payload (F9). Both are
 * additive and nullable, because every wire drawn before they existed carries
 * the bare message with nothing in front of it -- which is exactly what null
 * means for either column.
 */
function ensureRelayColumns(database: Database.Database): void {
  const columns = getTableColumnNames(database, 'session_relays')
  if (!columns.has('instruction')) {
    database.exec('ALTER TABLE session_relays ADD COLUMN instruction TEXT')
  }
  if (!columns.has('opener')) {
    database.exec('ALTER TABLE session_relays ADD COLUMN opener TEXT')
  }
}

/**
 * Kept after MAR-2609 excised code review: the table has no reader or writer
 * left, but it still holds Marcin's generated guides. MAR-2615 drops it once
 * he confirms he does not want them.
 */
function ensureCodeReviewGuideTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS code_review_guides (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('working-tree', 'base-branch')),
      cache_key TEXT NOT NULL,
      cache_identity_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
      overview TEXT NOT NULL DEFAULT '',
      generated_by TEXT NOT NULL CHECK (generated_by IN ('deterministic', 'agent')),
      sections_json TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE (target_id, mode, cache_key)
    );

    CREATE INDEX IF NOT EXISTS idx_code_review_guides_project_target
      ON code_review_guides(project_id, target_id, mode, updated_at DESC);
  `)
}

function tableExists(database: Database.Database, tableName: string): boolean {
  const row = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(tableName) as { name: string } | undefined

  return row !== undefined
}

function ensureSpaceTablesMigrated(database: Database.Database): void {
  if (!tableExists(database, 'initiatives')) return

  const existingSpaces = (
    database.prepare('SELECT COUNT(*) as count FROM spaces').get() as
      | { count: number }
      | undefined
  )?.count

  const migrate = database.transaction(() => {
    database.exec(`
      INSERT OR IGNORE INTO spaces (
        id, title, status, attention, brief, created_at, updated_at
      )
      SELECT
        id,
        title,
        status,
        attention,
        current_understanding,
        created_at,
        updated_at
      FROM initiatives;
    `)

    if (tableExists(database, 'initiative_attempts')) {
      database.exec(`
        INSERT OR IGNORE INTO space_attempts (
          id, space_id, session_id, role, is_primary, created_at
        )
        SELECT
          id,
          initiative_id,
          session_id,
          role,
          is_primary,
          created_at
        FROM initiative_attempts;
      `)
    }

    if (tableExists(database, 'initiative_outputs')) {
      database.exec(`
        INSERT OR IGNORE INTO space_artifacts (
          id,
          space_id,
          kind,
          label,
          value,
          source_session_id,
          status,
          created_at,
          updated_at
        )
        SELECT
          id,
          initiative_id,
          kind,
          label,
          value,
          source_session_id,
          status,
          created_at,
          updated_at
        FROM initiative_outputs;
      `)
    }
  })

  if ((existingSpaces ?? 0) === 0) {
    migrate()
  }
}

/**
 * The relay opener's injection bypass (F9), recorded on the queued input
 * because an opener may wait in the queue through a restart and must still
 * reach the provider byte for byte -- a "/clear" with a project-context block
 * prepended is no longer a command, it is prose.
 *
 * Zero for every row that already exists, which is what every other queued
 * input in the app means: inject as normal.
 */
function ensureQueuedInputColumns(database: Database.Database): void {
  if (
    !getTableColumnNames(database, 'session_queued_inputs').has(
      'skip_context_injection',
    )
  ) {
    database.exec(
      'ALTER TABLE session_queued_inputs ADD COLUMN skip_context_injection INTEGER NOT NULL DEFAULT 0',
    )
  }

  // The quiet send (F10, MAR-2537). A muted message may wait here through a
  // whole turn, and the mute belongs to what the user wrote rather than to
  // whatever the composer shows when the queue finally drains. Defaulted to 0
  // because every message queued before the quiet send existed fired its wires,
  // so there is nothing to backfill.
  if (
    !getTableColumnNames(database, 'session_queued_inputs').has('relays_muted')
  ) {
    database.exec(
      'ALTER TABLE session_queued_inputs ADD COLUMN relays_muted INTEGER NOT NULL DEFAULT 0',
    )
  }
}

/**
 * Per-turn account attribution (ADR 0007, PA4). Additive and nullable: every
 * existing row means "the ambient default account served this", which is the
 * truth for every turn taken before accounts existed.
 *
 * Claude's own transcript records no account attribution, so if these columns
 * do not hold it, the information does not exist anywhere.
 */
function ensureProviderAccountColumns(database: Database.Database): void {
  if (
    !getTableColumnNames(database, 'session_turns').has('provider_account_id')
  ) {
    database.exec(
      'ALTER TABLE session_turns ADD COLUMN provider_account_id TEXT',
    )
  }

  if (
    !getTableColumnNames(database, 'session_queued_inputs').has(
      'provider_account_id',
    )
  ) {
    database.exec(
      'ALTER TABLE session_queued_inputs ADD COLUMN provider_account_id TEXT',
    )
  }
}

/**
 * Per-turn model attribution (MAR-2551). Once a conversation can change model
 * between turns, the transcript silently mixes authors, and nothing else in the
 * tree remembers which one wrote which answer: the session row holds only the
 * standing intention, which is by definition the *latest* one.
 *
 * Additive and nullable, like the account columns above. A null means "taken
 * before this record existed" rather than "ran on no model" — there is nothing
 * to backfill it from, and inventing the session's current model for old turns
 * would make the record lie in exactly the way it exists to prevent.
 */
function ensureTurnModelColumns(database: Database.Database): void {
  const columnNames = getTableColumnNames(database, 'session_turns')

  if (!columnNames.has('model')) {
    database.exec('ALTER TABLE session_turns ADD COLUMN model TEXT')
  }

  if (!columnNames.has('effort')) {
    database.exec('ALTER TABLE session_turns ADD COLUMN effort TEXT')
  }
}

/**
 * What a stored diff *means* (MAR-2577). `truncated` and `binary` were always
 * computed — local capture derived both and then encoded them as marker strings
 * inside the diff body, and a remote host reports them as fields the mapping
 * had nowhere to put. A reader had to parse prose out of a diff to tell a
 * fragment from a whole change, and over the wire could not tell at all.
 *
 * The columns default to 0, but the default is not the answer for existing
 * rows: `truncateDiffIfTooLarge` has been cutting diffs since long before this
 * ticket, so rows written by the old path are genuinely truncated and genuinely
 * binary. Leaving them at 0 would put a stand-in where a known-true value
 * belongs, which is the exact failure this ticket exists to stop. So the values
 * are backfilled from the markers the old path left behind — see
 * `backfillTurnFileChangeMeaning` for what that can and cannot recover.
 *
 * `repo_root` is nullable and stays null for existing rows, and that is a fact
 * rather than a default: every row in this table was written by local capture
 * against a single working tree (`turn-capture.service.ts` is the only writer,
 * and a remote turn record never reached the database at all — MAR-2584), so
 * the working-directory root repository is where all of them belong.
 *
 * The columns and the backfill go in as ONE transaction, because the presence
 * of a column is also the flag that decides whether the backfill still needs to
 * run. Split them and an interruption in the gap is permanent: the next boot
 * sees the columns, computes `addedTruncated === false`, skips the backfill for
 * good, and a genuinely cut diff sits at 0 forever — the stand-in-for-a-known
 * -value failure this migration exists to prevent, reintroduced by the
 * migration itself. SQLite's DDL is transactional, so `ALTER TABLE` rolls back
 * with the rest.
 */
function ensureTurnFileChangeColumns(database: Database.Database): void {
  const migrate = database.transaction(() => {
    const columnNames = getTableColumnNames(
      database,
      'session_turn_file_changes',
    )
    const addedTruncated = !columnNames.has('truncated')
    const addedBinary = !columnNames.has('binary')

    if (!columnNames.has('repo_root')) {
      database.exec(
        'ALTER TABLE session_turn_file_changes ADD COLUMN repo_root TEXT',
      )
    }

    if (addedTruncated) {
      database.exec(
        'ALTER TABLE session_turn_file_changes ADD COLUMN truncated INTEGER NOT NULL DEFAULT 0',
      )
    }

    if (addedBinary) {
      database.exec(
        'ALTER TABLE session_turn_file_changes ADD COLUMN binary INTEGER NOT NULL DEFAULT 0',
      )
    }

    if (addedTruncated || addedBinary) {
      backfillTurnFileChangeMeaning(database, {
        truncated: addedTruncated,
        binary: addedBinary,
      })
    }
  })

  migrate()
}

/**
 * Recovers `truncated` and `binary` for rows written before they were fields
 * (MAR-2577), reading the two markers the old capture path stored in the diff
 * body — the same strings the same predicates still recognise today, so a
 * backfilled row carries what current capture would have written for it.
 *
 * What it cannot recover is the cut diff itself. `truncateDiffIfTooLarge`
 * replaces the whole body with `[diff truncated: N lines]`, so the content was
 * gone the day the row was written and no migration brings it back; the flag
 * now says the fragment is a fragment, which is all that was ever knowable.
 * It also cannot distinguish *who* cut a diff, because nothing was recorded —
 * but every row here is local capture's, so the cutter is this app's own 200 KB
 * cap.
 *
 * Runs once, only in the branch that just added the columns: a fresh database
 * gets them from SCHEMA with no rows to repair.
 */
function backfillTurnFileChangeMeaning(
  database: Database.Database,
  added: { truncated: boolean; binary: boolean },
): void {
  if (added.truncated) {
    // Mirrors isTruncatedDiff(): the marker replaces the body, so a prefix
    // match is the whole predicate, and SQL can do it without reading diffs
    // into memory.
    database
      .prepare(
        `UPDATE session_turn_file_changes
         SET truncated = 1
         WHERE substr(diff, 1, ?) = ?`,
      )
      .run(
        TURN_DIFF_TRUNCATION_MARKER_PREFIX.length,
        TURN_DIFF_TRUNCATION_MARKER_PREFIX,
      )
  }

  if (added.binary) {
    // Two shapes reach this column: the marker capture substitutes when it
    // detects a binary file, and git's own line-anchored notice inside a diff
    // it produced. Only the first is expressible in SQL, so the LIKE is a
    // prefilter and isBinaryDiff() — the predicate capture itself uses — makes
    // the decision.
    const candidates = database
      .prepare(
        `SELECT id, diff FROM session_turn_file_changes
         WHERE diff = ? OR diff LIKE '%Binary files %differ%'`,
      )
      .all(TURN_BINARY_DIFF_MARKER) as { id: string; diff: string }[]
    const markBinary = database.prepare(
      'UPDATE session_turn_file_changes SET binary = 1 WHERE id = ?',
    )
    for (const candidate of candidates) {
      if (isBinaryDiff(candidate.diff)) markBinary.run(candidate.id)
    }
  }
}

const TURN_FILE_CHANGE_IDENTITY_INDEX = 'idx_session_turn_file_changes_identity'

const TURN_FILE_CHANGE_IDENTITY_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS ${TURN_FILE_CHANGE_IDENTITY_INDEX}
    ON session_turn_file_changes(turn_id, COALESCE(repo_root, ''), file_path);
`

/**
 * Is this database still keyed the pre-MAR-2589 way?
 *
 * Asked of the table-level `UNIQUE (turn_id, file_path)` directly rather than
 * of the new index, because the two can coexist: `SCHEMA` runs before every
 * migration, and its `CREATE TABLE IF NOT EXISTS` is a no-op against an old
 * table, so "the new index exists" would answer yes on a database whose old
 * constraint is still there. `origin: 'u'` is SQLite's marker for an index it
 * created to back a `UNIQUE` clause, which is exactly the thing a rebuild is
 * the only way to remove.
 */
function hasLegacyTurnFileChangeUniqueConstraint(
  database: Database.Database,
): boolean {
  const indexes = database
    .prepare("PRAGMA index_list('session_turn_file_changes')")
    .all() as Array<{ name: string; unique: number; origin: string }>

  return indexes.some((index) => {
    if (index.origin !== 'u') return false
    const columns = database
      .prepare(`PRAGMA index_info('${index.name}')`)
      .all() as Array<{ name: string | null }>
    const names = columns.map((column) => column.name)
    return (
      names.length === 2 && names[0] === 'turn_id' && names[1] === 'file_path'
    )
  })
}

/**
 * A file change's identity includes its repository (MAR-2589).
 *
 * MAR-2577 gave the row a `repo_root` but left the key at `(turn_id,
 * file_path)`, so two repositories of one workspace changing the same path in
 * one turn do not merge -- they break the turn. `finalizeEnd` inserts the file
 * changes and stamps the turn's `ended_at` in one transaction, so the second
 * insert's `UNIQUE constraint failed` rolls back both: that turn loses every
 * file change and stays `running` forever. Unreachable until remote turn
 * records reach the database (MAR-2584), which is why this lands first.
 *
 * Two things have to happen and neither can happen alone:
 *
 * 1. The old constraint has to go, and SQLite cannot drop a table-level
 *    `UNIQUE` -- only a rebuild can: create, copy, drop, rename.
 * 2. The new one has to arrive as a unique *expression* index. The obvious
 *    `UNIQUE (turn_id, repo_root, file_path)` does not constrain rows where
 *    `repo_root IS NULL`, and that is every row this table already holds, so it
 *    would trade a rare collision for losing the common guarantee. Folding null
 *    to `''` inside the index keeps both, and keeps "null means the
 *    working-directory root" -- the design `turn.types.ts` and the wire mapping
 *    document -- rather than encoding the root as a magic empty string in the
 *    data.
 *
 * The whole rebuild, the index included, is ONE transaction. Between dropping
 * the old table and renaming the new one into its place there is no table named
 * `session_turn_file_changes` at all; a process killed in that gap would boot
 * next time into `SCHEMA`'s `CREATE TABLE IF NOT EXISTS`, get a fresh empty
 * table, and leave every real row stranded in `session_turn_file_changes_next`
 * with nothing that knows to look there. SQLite's DDL is transactional, so the
 * gap either closes or never opens.
 *
 * Foreign keys are off for the copy, the same way `ensureSessionsTableShape`
 * turns them off for its own rebuild. The copy has to be verbatim: enforcement
 * would re-check every row against `sessions` and `session_turns` on the way
 * in, and a row whose parent went missing at some point in this database's
 * history would turn a migration into a failed boot. A rebuild is not the place
 * to discover an integrity problem it did not cause.
 */
function ensureTurnFileChangeIdentity(database: Database.Database): void {
  if (!hasLegacyTurnFileChangeUniqueConstraint(database)) {
    // Fresh databases get the new table shape straight from SCHEMA, which
    // deliberately declares no UNIQUE clause; the identity index is still owed.
    database.exec(TURN_FILE_CHANGE_IDENTITY_INDEX_SQL)
    return
  }

  const columns = TURN_FILE_CHANGE_COLUMNS.join(', ')
  const foreignKeysEnabled =
    (database.pragma('foreign_keys', { simple: true }) as number) === 1

  if (foreignKeysEnabled) {
    database.pragma('foreign_keys = OFF')
  }

  try {
    database.transaction(() => {
      const sourceCount = (
        database
          .prepare('SELECT COUNT(*) AS count FROM session_turn_file_changes')
          .get() as { count: number }
      ).count

      database.exec('DROP TABLE IF EXISTS session_turn_file_changes_next')
      database.exec(
        buildTurnFileChangesTableSql('session_turn_file_changes_next', false),
      )
      database.exec(`
        INSERT INTO session_turn_file_changes_next (${columns})
        SELECT ${columns} FROM session_turn_file_changes;
      `)
      database.exec('DROP TABLE session_turn_file_changes')
      database.exec(
        'ALTER TABLE session_turn_file_changes_next RENAME TO session_turn_file_changes',
      )
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_session_turn_file_changes_session_turn
          ON session_turn_file_changes(session_id, turn_id);
      `)
      database.exec(TURN_FILE_CHANGE_IDENTITY_INDEX_SQL)

      const copiedCount = (
        database
          .prepare('SELECT COUNT(*) AS count FROM session_turn_file_changes')
          .get() as { count: number }
      ).count

      if (copiedCount !== sourceCount) {
        throw new Error(
          `Failed to rebuild session_turn_file_changes: copied ${copiedCount} of ${sourceCount} rows`,
        )
      }
    })()
  } finally {
    if (foreignKeysEnabled) {
      database.pragma('foreign_keys = ON')
    }
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

  if (!columnNames.has('service_tier')) {
    database.exec('ALTER TABLE sessions ADD COLUMN service_tier TEXT')
  }

  if (!columnNames.has('permission_config')) {
    database.exec(
      `ALTER TABLE sessions ADD COLUMN permission_config TEXT NOT NULL DEFAULT '{"preset":"ask"}'`,
    )
  }

  if (!columnNames.has('continuation_token')) {
    database.exec('ALTER TABLE sessions ADD COLUMN continuation_token TEXT')
  }

  if (!columnNames.has('context_kind')) {
    database.exec(
      "ALTER TABLE sessions ADD COLUMN context_kind TEXT NOT NULL DEFAULT 'project'",
    )
  }

  if (!columnNames.has('context_window')) {
    database.exec('ALTER TABLE sessions ADD COLUMN context_window TEXT')
  }

  if (!columnNames.has('activity')) {
    database.exec('ALTER TABLE sessions ADD COLUMN activity TEXT')
  }

  // The quiet send (F10, MAR-2537): a human asked for quiet since this session
  // last settled. Persisted rather than held in memory because remote runs
  // outlive the app process and reattach, so their settles arrive after a
  // restart with nothing in memory behind them. Zero is the honest default --
  // every session that existed before the quiet send fired its wires.
  if (!columnNames.has('relays_muted')) {
    database.exec(
      'ALTER TABLE sessions ADD COLUMN relays_muted INTEGER NOT NULL DEFAULT 0',
    )
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

  if (!columnNames.has('execution_host')) {
    database.exec(
      "ALTER TABLE sessions ADD COLUMN execution_host TEXT NOT NULL DEFAULT 'local'",
    )
  }

  if (!columnNames.has('execution_host_last_seq')) {
    database.exec(
      'ALTER TABLE sessions ADD COLUMN execution_host_last_seq INTEGER NOT NULL DEFAULT 0',
    )
  }
}

/**
 * Which execution-host event already ended a turn on this session (MAR-2582).
 *
 * An execution host replays: a remote session resumes its event stream from
 * `execution_host_last_seq`, so an event Convergence has already applied can
 * arrive a second time. Replaying a terminal `status` is the expensive one --
 * it would release the handle a *later* turn is running on. The record has to
 * be able to say "that settle already happened", and it cannot use the stream
 * cursor to say it: the cursor is what the replay resumes from, so a stale one
 * is exactly the case that needs catching.
 *
 * So this column is written by the same statement that writes the status it
 * belongs to (`SessionService.applySessionPatch`). It survives whenever the
 * status survives, which is the property the cursor does not have.
 *
 * The column and its backfill go in as ONE transaction, because the presence
 * of the column is also the flag that says whether the backfill still needs to
 * run. Split them and an interruption in the gap is permanent: the next boot
 * sees the column, skips the backfill for good, and every session that settled
 * before this release keeps a 0 that reads as "never settled". SQLite's DDL is
 * transactional, so `ALTER TABLE` rolls back with the rest.
 *
 * What the backfill recovers: for a remote session already at rest, the
 * terminal event was the last event the record applied, so the cursor holds
 * that event's own sequence. A cursor that sits *above* the settle -- an
 * `attention` event arrived after it -- is still safe, because sequences only
 * grow and a later genuine settle therefore lands above it too.
 *
 * What it cannot recover: a row whose cursor write was lost in the very gap
 * this change closes. Its cursor holds the event *before* the settle, so the
 * backfilled marker is one sequence short and the settle the daemon replays
 * lands above it. Nothing here can know that, and nothing needs to: a settle
 * ends only the run of the handle that began it, and a replayed one belongs
 * to a handle that is already gone (`session.service.ts`, `handleLifecycle`).
 * The marker is a cheap first rejection, not the thing that keeps these rows
 * safe. Every settle written from here on records its own sequence exactly.
 */
function ensureSessionSettledSeqColumn(database: Database.Database): void {
  const migrate = database.transaction(() => {
    if (
      getTableColumnNames(database, 'sessions').has(
        'execution_host_settled_seq',
      )
    ) {
      return
    }
    database.exec(
      'ALTER TABLE sessions ADD COLUMN execution_host_settled_seq INTEGER NOT NULL DEFAULT 0',
    )
    database.exec(`
      UPDATE sessions
         SET execution_host_settled_seq = execution_host_last_seq
       WHERE execution_host != 'local'
         AND status IN ('completed', 'failed')
         AND execution_host_last_seq > 0
    `)
  })
  migrate()
}

/**
 * Endpoints become plural, and the sessions that ran on one say which
 * (MAR-2620).
 *
 * Before this, `sessions.execution_host` held `'local'` or `'remote'`, and
 * App Settings held exactly one `executionHostRemoteBaseUrl`. That worked while
 * there could only ever be one daemon. With two, `'remote'` names neither of
 * them, and a session resolving to whichever daemon happens to be configured
 * would run on a machine it never agreed to. So the string becomes an id, and
 * the single base URL becomes the first Endpoint that id points at.
 *
 * The table's absence is the flag that says the backfill is still owed, so the
 * `CREATE TABLE`, the Endpoint it is seeded with, the session rows and the
 * settings rewrite all go in as ONE transaction. Split them and an interrupt in
 * any gap is permanent: the next boot sees the table, skips the rest for good,
 * and Marcin's two remote sessions keep a `'remote'` that resolves to nothing
 * while the base URL that could have explained it is already gone. SQLite's DDL
 * is transactional, so `CREATE TABLE` rolls back with the rest.
 *
 * What the backfill recovers: which machine those rows ran on. While the
 * single-host settings still hold a base URL, there was exactly one daemon it
 * could have been, and that daemon becomes the first Endpoint.
 *
 * What it cannot recover: which daemon a `'remote'` row ran on when no base URL
 * is configured. The address is simply not in the record any more — it was
 * overwritten or cleared some time after the run. Those rows take the reserved
 * `legacy-remote` id, which deliberately matches no Endpoint: they resolve to
 * nothing and say so, because the only alternative is to guess at a machine,
 * and guessing is the exact failure this era exists to prevent.
 */
function ensureExecutionHostEndpoints(database: Database.Database): void {
  const migrate = database.transaction(() => {
    if (tableExists(database, 'execution_host_endpoints')) return

    database.exec(`
      CREATE TABLE execution_host_endpoints (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        base_url TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    const settingsRow = database
      .prepare('SELECT value FROM app_state WHERE key = ?')
      .get(APP_SETTINGS_KEY) as { value: string } | undefined
    const legacySettings = parseLegacySettingsJson(settingsRow?.value)
    const baseUrl = normalizeExecutionHostBaseUrl(
      legacySettings
        ? (legacySettings.executionHostRemoteBaseUrl as string | null)
        : null,
    )

    if (baseUrl) {
      database
        .prepare(
          `INSERT INTO execution_host_endpoints (id, label, base_url, position)
           VALUES (?, ?, ?, 0)`,
        )
        .run(
          DEFAULT_EXECUTION_HOST_ENDPOINT_ID,
          DEFAULT_EXECUTION_HOST_ENDPOINT_LABEL,
          baseUrl,
        )
    }

    database
      .prepare(
        `UPDATE sessions
            SET execution_host = ?
          WHERE execution_host = 'remote'`,
      )
      .run(
        baseUrl
          ? DEFAULT_EXECUTION_HOST_ENDPOINT_ID
          : LEGACY_REMOTE_EXECUTION_HOST_ID,
      )

    // The Endpoint row is now the only place the base URL lives. Leaving a copy
    // in the settings blob would be a second encoding of one fact, and the two
    // would drift the first time an Endpoint is renamed or removed.
    if (legacySettings && 'executionHostRemoteBaseUrl' in legacySettings) {
      delete legacySettings.executionHostRemoteBaseUrl
      database
        .prepare('UPDATE app_state SET value = ? WHERE key = ?')
        .run(JSON.stringify(legacySettings), APP_SETTINGS_KEY)
    }
  })
  migrate()
}

function parseLegacySettingsJson(
  raw: string | undefined,
): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    // An unreadable settings blob is already handled everywhere else by
    // falling back to defaults; it carries no base URL to migrate either way.
    return null
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

function ensureSessionsTableShape(database: Database.Database): void {
  const sourceColumnNames = getTableColumnNames(database, 'sessions')
  const hasTranscriptColumn = sourceColumnNames.has('transcript')
  const needsContextShape = needsSessionContextShapeMigration(database)

  if (!hasTranscriptColumn && !needsContextShape) return

  if (hasTranscriptColumn) {
    ensureLegacyTranscriptCoverage(database)
  }

  const foreignKeysEnabled =
    (database.pragma('foreign_keys', { simple: true }) as number) === 1

  if (foreignKeysEnabled) {
    database.pragma('foreign_keys = OFF')
  }

  try {
    database.transaction(() => {
      database.exec('DROP TABLE IF EXISTS sessions_next')
      database.exec(buildSessionsTableSql('sessions_next', false))
      const contextKindSelect = sourceColumnNames.has('context_kind')
        ? `CASE
            WHEN context_kind = 'global'
              AND project_id IS NULL
              AND workspace_id IS NULL
              THEN 'global'
            ELSE 'project'
          END`
        : "'project'"
      const permissionConfigSelect = sourceColumnNames.has('permission_config')
        ? `CASE
            WHEN permission_config IS NOT NULL AND permission_config != ''
              THEN permission_config
            ELSE '{"preset":"ask"}'
          END`
        : `'{"preset":"ask"}'`
      database.exec(`
        INSERT INTO sessions_next (
          id,
          context_kind,
          project_id,
          workspace_id,
          provider_id,
          model,
          effort,
          service_tier,
          permission_config,
          continuation_token,
          name,
          status,
          attention,
          working_directory,
          context_window,
          activity,
          relays_muted,
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
          ${contextKindSelect},
          project_id,
          workspace_id,
          provider_id,
          model,
          effort,
          ${sourceColumnNames.has('service_tier') ? 'service_tier' : 'NULL'},
          ${permissionConfigSelect},
          continuation_token,
          name,
          status,
          attention,
          working_directory,
          context_window,
          activity,
          ${sourceColumnNames.has('relays_muted') ? 'relays_muted' : '0'},
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
          'Failed to rebuild sessions table shape: foreign key check failed',
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
    ensureSpaceTablesMigrated(database)
    ensureSpaceColumns(database)
    ensureProjectScriptColumns(database)
    ensureCodeReviewGuideTable(database)
    ensureWorkspaceColumns(database)
    ensureSessionColumns(database)
    ensureSessionSettledSeqColumn(database)
    // After the session columns, never before: the backfill rewrites
    // `execution_host`, which a database older than the remote era lacks.
    ensureExecutionHostEndpoints(database)
    ensureProviderAccountColumns(database)
    ensureTurnModelColumns(database)
    ensureTurnFileChangeColumns(database)
    // After the columns, never before: the identity index reads `repo_root`,
    // which a database older than MAR-2577 does not have yet.
    ensureTurnFileChangeIdentity(database)
    ensureQueuedInputColumns(database)
    ensureRelayColumns(database)
    ensureAttachmentsTableNoFk(database)
    migrateLegacySessionConversations(database)
    ensureSessionsTableShape(database)
  } catch (error) {
    database.close()
    throw error
  }

  db = database
  return database
}

export {
  ensureAttachmentsTableNoFk,
  ensureTurnFileChangeIdentity,
  TURN_FILE_CHANGE_IDENTITY_INDEX,
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
