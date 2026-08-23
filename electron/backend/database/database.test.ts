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
    expect(tableNames).toContain('session_conversation_items')
    expect(tableNames).toContain('session_queued_inputs')
    expect(tableNames).toContain('session_terminal_layout')
    expect(tableNames).toContain('session_turns')
    expect(tableNames).toContain('session_turn_file_changes')
    expect(tableNames).toContain('project_scripts')
    expect(tableNames).toContain('project_script_runs')
    expect(tableNames).toContain('spaces')
    expect(tableNames).toContain('space_attempts')
    expect(tableNames).toContain('space_artifacts')
    expect(tableNames).toContain('space_sources')
    expect(tableNames).toContain('session_crews')
    expect(tableNames).toContain('session_crew_members')
    expect(tableNames).toContain('session_relays')
    expect(tableNames).toContain('relay_hops')
    expect(tableNames).toContain('project_context_items')
    expect(tableNames).toContain('session_context_attachments')
    expect(tableNames).toContain('analytics_profile_snapshots')
    expect(tableNames).toContain('skill_catalog_cache')

    const sessionColumns = db
      .prepare("PRAGMA table_info('sessions')")
      .all() as Array<{ name: string; notnull: number }>
    const columnNames = sessionColumns.map((column) => column.name)
    expect(columnNames).not.toContain('transcript')
    expect(columnNames).toContain('context_kind')
    expect(columnNames).toContain('service_tier')
    expect(columnNames).toContain('primary_surface')
    expect(
      sessionColumns.find((column) => column.name === 'project_id')?.notnull,
    ).toBe(0)

    const workspaceColumns = db
      .prepare("PRAGMA table_info('workspaces')")
      .all() as Array<{ name: string }>
    const workspaceColumnNames = workspaceColumns.map((column) => column.name)
    expect(workspaceColumnNames).toContain('archived_at')
    expect(workspaceColumnNames).toContain('worktree_removed_at')
  })

  it('creates analytics_profile_snapshots with expected columns and delete behavior', () => {
    const db = getDatabase()
    const columns = db
      .prepare("PRAGMA table_info('analytics_profile_snapshots')")
      .all() as Array<{ name: string }>

    expect(columns.map((c) => c.name).sort()).toEqual(
      [
        'id',
        'range_preset',
        'range_start_date',
        'range_end_date',
        'provider_id',
        'model',
        'profile_json',
        'created_at',
      ].sort(),
    )

    db.prepare(
      `
        INSERT INTO analytics_profile_snapshots (
          id,
          range_preset,
          range_start_date,
          range_end_date,
          provider_id,
          model,
          profile_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      'profile-1',
      '30d',
      '2026-04-01',
      '2026-04-30',
      'codex',
      'gpt-5.4',
      JSON.stringify({
        version: 1,
        title: 'Builder',
        summary: 'Summary',
        themes: [],
        caveats: [],
      }),
      '2026-04-30T12:00:00.000Z',
    )

    db.prepare('DELETE FROM analytics_profile_snapshots WHERE id = ?').run(
      'profile-1',
    )

    const remaining = db
      .prepare('SELECT id FROM analytics_profile_snapshots WHERE id = ?')
      .all('profile-1')
    expect(remaining).toEqual([])
  })

  it('cascades terminal-layout rows when their session is deleted', () => {
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p', 'p', '/tmp/p')",
    ).run()
    db.prepare(
      `INSERT INTO sessions (
         id, project_id, provider_id, name, working_directory
       ) VALUES ('s', 'p', 'shell', 'term', '/tmp/p')`,
    ).run()
    db.prepare(
      `INSERT INTO session_terminal_layout (
         session_id, layout_json, updated_at
       ) VALUES ('s', '{}', '2026-01-01T00:00:00.000Z')`,
    ).run()

    db.prepare('DELETE FROM sessions WHERE id = ?').run('s')

    const remaining = db
      .prepare(
        'SELECT session_id FROM session_terminal_layout WHERE session_id = ?',
      )
      .all('s')
    expect(remaining).toEqual([])
  })

  it('enforces explicit project and global session context constraints', () => {
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p', 'p', '/tmp/p')",
    ).run()

    db.prepare(
      `INSERT INTO sessions (
         id, context_kind, project_id, provider_id, name, working_directory
       ) VALUES ('project-session', 'project', 'p', 'codex', 'project', '/tmp/p')`,
    ).run()
    db.prepare(
      `INSERT INTO sessions (
         id, context_kind, project_id, workspace_id, provider_id, name, working_directory
       ) VALUES ('global-session', 'global', NULL, NULL, 'codex', 'global', '/tmp/global')`,
    ).run()

    const rows = db
      .prepare(
        'SELECT id, context_kind, project_id, workspace_id FROM sessions ORDER BY id',
      )
      .all() as Array<{
      id: string
      context_kind: string
      project_id: string | null
      workspace_id: string | null
    }>
    expect(rows).toEqual([
      {
        id: 'global-session',
        context_kind: 'global',
        project_id: null,
        workspace_id: null,
      },
      {
        id: 'project-session',
        context_kind: 'project',
        project_id: 'p',
        workspace_id: null,
      },
    ])

    expect(() =>
      db
        .prepare(
          `INSERT INTO sessions (
             id, context_kind, project_id, provider_id, name, working_directory
           ) VALUES ('bad-global', 'global', 'p', 'codex', 'bad', '/tmp/p')`,
        )
        .run(),
    ).toThrow()
    expect(() =>
      db
        .prepare(
          `INSERT INTO sessions (
             id, context_kind, project_id, provider_id, name, working_directory
           ) VALUES ('bad-project', 'project', NULL, 'codex', 'bad', '/tmp/p')`,
        )
        .run(),
    ).toThrow()
    expect(() =>
      db
        .prepare(
          `INSERT INTO sessions (
             id, context_kind, project_id, provider_id, name, working_directory
           ) VALUES ('bad-kind', 'other', 'p', 'codex', 'bad', '/tmp/p')`,
        )
        .run(),
    ).toThrow()
  })

  it('creates session_turns with expected columns, FK, and unique constraint', () => {
    const db = getDatabase()
    const columns = db
      .prepare("PRAGMA table_info('session_turns')")
      .all() as Array<{ name: string }>
    expect(columns.map((c) => c.name).sort()).toEqual(
      [
        'id',
        'session_id',
        'sequence',
        'started_at',
        'ended_at',
        'status',
        'summary',
        'provider_account_id',
        'model',
        'effort',
      ].sort(),
    )

    const foreignKeys = db
      .prepare("PRAGMA foreign_key_list('session_turns')")
      .all() as Array<{ table: string; on_delete: string }>
    expect(foreignKeys.some((fk) => fk.table === 'sessions')).toBe(true)
    expect(foreignKeys[0]?.on_delete).toBe('CASCADE')

    const indexList = db
      .prepare("PRAGMA index_list('session_turns')")
      .all() as Array<{ name: string; unique: number }>
    const uniqueIndex = indexList.find((idx) => idx.unique === 1)
    expect(uniqueIndex).toBeDefined()
    const uniqueColumns = db
      .prepare(`PRAGMA index_info('${uniqueIndex!.name}')`)
      .all() as Array<{ name: string }>
    expect(uniqueColumns.map((c) => c.name).sort()).toEqual(
      ['session_id', 'sequence'].sort(),
    )
  })

  it('creates session_queued_inputs with expected columns and FK', () => {
    const db = getDatabase()
    const columns = db
      .prepare("PRAGMA table_info('session_queued_inputs')")
      .all() as Array<{ name: string }>
    expect(columns.map((c) => c.name).sort()).toEqual(
      [
        'id',
        'session_id',
        'delivery_mode',
        'state',
        'text',
        'attachment_ids_json',
        'skill_selections_json',
        'provider_request_id',
        'provider_account_id',
        'skip_context_injection',
        'relays_muted',
        'error',
        'created_at',
        'updated_at',
      ].sort(),
    )

    const foreignKeys = db
      .prepare("PRAGMA foreign_key_list('session_queued_inputs')")
      .all() as Array<{ table: string; on_delete: string }>
    expect(foreignKeys.some((fk) => fk.table === 'sessions')).toBe(true)
    expect(foreignKeys[0]?.on_delete).toBe('CASCADE')
  })

  it('creates session_turn_file_changes with expected columns, FKs, and unique constraint', () => {
    const db = getDatabase()
    const columns = db
      .prepare("PRAGMA table_info('session_turn_file_changes')")
      .all() as Array<{ name: string }>
    expect(columns.map((c) => c.name).sort()).toEqual(
      [
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
      ].sort(),
    )

    const foreignKeys = db
      .prepare("PRAGMA foreign_key_list('session_turn_file_changes')")
      .all() as Array<{ table: string; on_delete: string }>
    const fkTables = foreignKeys.map((fk) => fk.table).sort()
    expect(fkTables).toEqual(['session_turns', 'sessions'].sort())
    for (const fk of foreignKeys) {
      expect(fk.on_delete).toBe('CASCADE')
    }

    const indexList = db
      .prepare("PRAGMA index_list('session_turn_file_changes')")
      .all() as Array<{ name: string; unique: number }>
    const uniqueIndex = indexList.find((idx) => idx.unique === 1)
    expect(uniqueIndex).toBeDefined()
    const uniqueColumns = db
      .prepare(`PRAGMA index_info('${uniqueIndex!.name}')`)
      .all() as Array<{ name: string }>
    expect(uniqueColumns.map((c) => c.name).sort()).toEqual(
      ['file_path', 'turn_id'].sort(),
    )
  })

  it('backfills what a legacy diff meant from the markers it was left with', () => {
    const dir = mkdtempSync(
      join(tmpdir(), 'convergence-file-change-flags-migration-'),
    )
    const dbPath = join(dir, 'pre-file-change-flags.sqlite')

    try {
      const legacy = new Database(dbPath)
      legacy.exec(`
        CREATE TABLE session_turn_file_changes (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          turn_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          old_path TEXT,
          status TEXT NOT NULL,
          additions INTEGER NOT NULL DEFAULT 0,
          deletions INTEGER NOT NULL DEFAULT 0,
          diff TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        INSERT INTO session_turn_file_changes (
          id, session_id, turn_id, file_path, status, additions, deletions, diff, created_at
        ) VALUES
          ('fc-whole', 's1', 't1', 'src/a.ts', 'modified', 1, 0, '@@ -1 +1 @@', '2026-01-01'),
          ('fc-cut', 's1', 't1', 'src/b.ts', 'modified', 0, 0, '[diff truncated: 4210 lines]', '2026-01-01'),
          ('fc-binary-marker', 's1', 't1', 'assets/logo.png', 'modified', 0, 0, '[binary file change]', '2026-01-01'),
          ('fc-binary-git', 's1', 't1', 'assets/icon.png', 'modified', 0, 0, 'diff --git a/assets/icon.png b/assets/icon.png' || char(10) || 'Binary files a/assets/icon.png and b/assets/icon.png differ', '2026-01-01'),
          ('fc-mentions-binary', 's1', 't1', 'docs/notes.md', 'modified', 1, 0, '@@ -1 +1 @@' || char(10) || '+Binary files a/x and b/x differ', '2026-01-01');
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const rows = db
        .prepare(
          `SELECT id, repo_root, truncated, binary
           FROM session_turn_file_changes
           ORDER BY id ASC`,
        )
        .all() as {
        id: string
        repo_root: string | null
        truncated: number
        binary: number
      }[]

      // 0 would have been a stand-in for a known-true value, not the truth:
      // truncateDiffIfTooLarge has been cutting diffs since long before these
      // columns existed, and the marker it left behind is what says so
      // (MAR-2577). The last row is the guard on the SQL prefilter — the phrase
      // appears in the diff's *content*, on an added line, so the line-anchored
      // predicate must leave it alone.
      expect(rows).toEqual([
        {
          id: 'fc-binary-git',
          repo_root: null,
          truncated: 0,
          binary: 1,
        },
        {
          id: 'fc-binary-marker',
          repo_root: null,
          truncated: 0,
          binary: 1,
        },
        { id: 'fc-cut', repo_root: null, truncated: 1, binary: 0 },
        { id: 'fc-mentions-binary', repo_root: null, truncated: 0, binary: 0 },
        { id: 'fc-whole', repo_root: null, truncated: 0, binary: 0 },
      ])
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('still backfills a legacy row after a migration was interrupted mid-way', () => {
    const dir = mkdtempSync(
      join(tmpdir(), 'convergence-file-change-flags-interrupt-'),
    )
    const dbPath = join(dir, 'interrupted-migration.sqlite')

    try {
      const legacy = new Database(dbPath)
      legacy.exec(`
        CREATE TABLE session_turn_file_changes (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          turn_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          old_path TEXT,
          status TEXT NOT NULL,
          additions INTEGER NOT NULL DEFAULT 0,
          deletions INTEGER NOT NULL DEFAULT 0,
          diff TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        INSERT INTO session_turn_file_changes (
          id, session_id, turn_id, file_path, status, additions, deletions, diff, created_at
        ) VALUES
          ('fc-cut', 's1', 't1', 'src/b.ts', 'modified', 0, 0, '[diff truncated: 4210 lines]', '2026-01-01');

        -- Fails the migration's first backfill write, which is exactly the gap
        -- between the ALTER and the backfill. A process kill at the same point
        -- leaves the same durable state, because both end as an uncommitted
        -- transaction SQLite rolls back.
        CREATE TRIGGER interrupt_backfill
        BEFORE UPDATE ON session_turn_file_changes
        BEGIN
          SELECT RAISE(ABORT, 'simulated interrupt mid-migration');
        END;
      `)
      legacy.close()

      expect(() => getDatabase(dbPath)).toThrow(
        /simulated interrupt mid-migration/,
      )
      closeDatabase()
      resetDatabase()

      // The interrupt must have taken the columns down with it. If the ALTERs
      // committed on their own, the column's presence -- which is the only flag
      // saying whether the backfill still owes this table anything -- would tell
      // the next boot the work was already done (MAR-2577).
      const afterInterrupt = new Database(dbPath)
      const columnsAfterInterrupt = (
        afterInterrupt
          .prepare("PRAGMA table_info('session_turn_file_changes')")
          .all() as { name: string }[]
      ).map((column) => column.name)
      expect(columnsAfterInterrupt).not.toContain('truncated')
      expect(columnsAfterInterrupt).not.toContain('binary')
      afterInterrupt.exec('DROP TRIGGER interrupt_backfill')
      afterInterrupt.close()

      // The interrupt is over; this boot is the one that gets to finish. The
      // row is still knowably truncated, so it must end up saying so.
      const db = getDatabase(dbPath)
      const row = db
        .prepare(
          `SELECT id, truncated, binary
           FROM session_turn_file_changes
           WHERE id = 'fc-cut'`,
        )
        .get() as { id: string; truncated: number; binary: number }

      expect(row).toEqual({ id: 'fc-cut', truncated: 1, binary: 0 })
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('leaves repo_root null for legacy rows, which is where they belong', () => {
    const dir = mkdtempSync(
      join(tmpdir(), 'convergence-file-change-repo-root-'),
    )
    const dbPath = join(dir, 'pre-repo-root.sqlite')

    try {
      const legacy = new Database(dbPath)
      legacy.exec(`
        CREATE TABLE session_turn_file_changes (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          turn_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          old_path TEXT,
          status TEXT NOT NULL,
          additions INTEGER NOT NULL DEFAULT 0,
          deletions INTEGER NOT NULL DEFAULT 0,
          diff TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        INSERT INTO session_turn_file_changes (
          id, session_id, turn_id, file_path, status, additions, deletions, diff, created_at
        ) VALUES ('fc-old', 's1', 't1', 'src/a.ts', 'modified', 1, 0, '@@', '2026-01-01');
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const row = db
        .prepare(
          "SELECT repo_root FROM session_turn_file_changes WHERE id = 'fc-old'",
        )
        .get() as { repo_root: string | null }

      // Unlike the two flags, this one needs no recovery: turn-capture is the
      // only writer this table has ever had, it reads a single working tree,
      // and a remote turn record never reached the database (MAR-2584). Null is
      // the working-directory root repository, which is where every one of
      // these rows belongs.
      expect(row).toEqual({ repo_root: null })
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('cascades session_turns deletion when parent session is deleted', () => {
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p', '/tmp/p')",
    ).run()
    db.prepare(
      "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s1', 'p1', 'codex', 's', '/tmp/p')",
    ).run()
    db.prepare(
      "INSERT INTO session_turns (id, session_id, sequence, started_at, status) VALUES ('t1', 's1', 1, '2026-04-23T10:00:00.000Z', 'running')",
    ).run()
    db.prepare(
      "INSERT INTO session_turn_file_changes (id, session_id, turn_id, file_path, status, diff, created_at) VALUES ('c1', 's1', 't1', 'a.ts', 'added', '', '2026-04-23T10:00:00.000Z')",
    ).run()

    db.prepare('DELETE FROM sessions WHERE id = ?').run('s1')

    const turns = db
      .prepare('SELECT id FROM session_turns WHERE session_id = ?')
      .all('s1')
    const changes = db
      .prepare('SELECT id FROM session_turn_file_changes WHERE session_id = ?')
      .all('s1')
    expect(turns).toEqual([])
    expect(changes).toEqual([])
  })

  it('creates space tables with expected constraints', () => {
    const db = getDatabase()
    const spaceColumns = db
      .prepare("PRAGMA table_info('spaces')")
      .all() as Array<{ name: string }>
    expect(spaceColumns.map((c) => c.name).sort()).toEqual(
      [
        'id',
        'title',
        'status',
        'attention',
        'brief',
        'memory',
        'archived_at',
        'created_at',
        'updated_at',
      ].sort(),
    )

    const attemptForeignKeys = db
      .prepare("PRAGMA foreign_key_list('space_attempts')")
      .all() as Array<{ table: string; on_delete: string }>
    expect(attemptForeignKeys.map((fk) => fk.table).sort()).toEqual(
      ['spaces', 'sessions'].sort(),
    )
    for (const fk of attemptForeignKeys) {
      expect(fk.on_delete).toBe('CASCADE')
    }

    const artifactForeignKeys = db
      .prepare("PRAGMA foreign_key_list('space_artifacts')")
      .all() as Array<{ table: string; on_delete: string }>
    expect(artifactForeignKeys.map((fk) => fk.table).sort()).toEqual(
      ['spaces', 'sessions'].sort(),
    )
    expect(
      artifactForeignKeys.some(
        (fk) => fk.table === 'sessions' && fk.on_delete === 'SET NULL',
      ),
    ).toBe(true)

    const sourceColumns = db
      .prepare("PRAGMA table_info('space_sources')")
      .all() as Array<{ name: string }>
    expect(sourceColumns.map((c) => c.name).sort()).toEqual(
      [
        'id',
        'space_id',
        'filename',
        'original_path',
        'storage_path',
        'size_bytes',
        'created_at',
      ].sort(),
    )

    const sourceForeignKeys = db
      .prepare("PRAGMA foreign_key_list('space_sources')")
      .all() as Array<{ table: string; on_delete: string }>
    expect(sourceForeignKeys).toEqual([
      expect.objectContaining({ table: 'spaces', on_delete: 'CASCADE' }),
    ])
  })

  it('creates crew tables with decoration columns and no foreign keys', () => {
    const db = getDatabase()

    const crewColumns = db
      .prepare("PRAGMA table_info('session_crews')")
      .all() as Array<{ name: string }>
    expect(crewColumns.map((c) => c.name).sort()).toEqual(
      [
        'id',
        'name',
        'emoji',
        'accent_color',
        'position',
        'created_at',
        'updated_at',
      ].sort(),
    )

    const memberColumns = db
      .prepare("PRAGMA table_info('session_crew_members')")
      .all() as Array<{ name: string }>
    expect(memberColumns.map((c) => c.name).sort()).toEqual(
      ['crew_id', 'session_id', 'added_at'].sort(),
    )

    // Membership must never cascade in either direction: a crew is a label,
    // not an owner, and a deleted session leaves a harmless orphan row.
    expect(
      db.prepare("PRAGMA foreign_key_list('session_crew_members')").all(),
    ).toEqual([])

    db.prepare(
      "INSERT INTO session_crews (id, name) VALUES ('c1', 'Convoy')",
    ).run()
    db.prepare(
      "INSERT INTO session_crew_members (crew_id, session_id) VALUES ('c1', 's1')",
    ).run()
    expect(() =>
      db
        .prepare(
          "INSERT INTO session_crew_members (crew_id, session_id) VALUES ('c1', 's1')",
        )
        .run(),
    ).toThrow(/UNIQUE/)
  })

  it('creates relay and hop tables with no foreign keys', () => {
    const db = getDatabase()

    const relayColumns = db
      .prepare("PRAGMA table_info('session_relays')")
      .all() as Array<{ name: string }>
    expect(relayColumns.map((c) => c.name).sort()).toEqual(
      [
        'id',
        'crew_id',
        'source_session_id',
        'trigger',
        'action',
        'target_session_id',
        'spawn_spec_json',
        'instruction',
        'opener',
        'armed',
        'created_at',
        'updated_at',
      ].sort(),
    )

    const hopColumns = db
      .prepare("PRAGMA table_info('relay_hops')")
      .all() as Array<{ name: string }>
    expect(hopColumns.map((c) => c.name).sort()).toEqual(
      [
        'id',
        'relay_id',
        'crew_id',
        'flow_run_id',
        'fired_at',
        'source_session_id',
        'target_session_id',
        'spawned_session_id',
        'trigger_status',
        'payload_preview',
        'outcome',
        'error',
      ].sort(),
    )

    // Deleting a session or a crew must leave the wires and the ledger
    // standing: a hop that vanishes is a hop nobody can audit.
    expect(
      db.prepare("PRAGMA foreign_key_list('session_relays')").all(),
    ).toEqual([])
    expect(db.prepare("PRAGMA foreign_key_list('relay_hops')").all()).toEqual(
      [],
    )
  })

  it('defaults a relay to the settled trigger, armed, and survives its sessions', () => {
    const db = getDatabase()

    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p1', '/tmp/p1')",
    ).run()
    db.prepare(
      `INSERT INTO sessions (id, project_id, provider_id, name, working_directory)
       VALUES ('s1', 'p1', 'codex', 's1', '/tmp/p1')`,
    ).run()

    db.prepare(
      `INSERT INTO session_relays (id, crew_id, source_session_id, action)
       VALUES ('r1', 'c1', 's1', 'hail')`,
    ).run()

    const relay = db
      .prepare("SELECT * FROM session_relays WHERE id = 'r1'")
      .get() as { trigger: string; armed: number; target_session_id: null }
    expect(relay.trigger).toBe('settled')
    expect(relay.armed).toBe(1)
    expect(relay.target_session_id).toBeNull()

    db.prepare(
      `INSERT INTO relay_hops (
         id, relay_id, crew_id, flow_run_id, source_session_id,
         trigger_status, outcome
       )
       VALUES ('h1', 'r1', 'c1', 'run-1', 's1', 'completed', 'delivered')`,
    ).run()

    db.prepare("DELETE FROM sessions WHERE id = 's1'").run()

    expect(
      db.prepare('SELECT COUNT(*) AS n FROM session_relays').get(),
    ).toEqual({ n: 1 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM relay_hops').get()).toEqual({
      n: 1,
    })
  })

  it('adds the queued-input injection bypass to a database that predates it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'convergence-queued-migration-'))
    const dbPath = join(dir, 'pre-bypass.sqlite')

    try {
      const legacy = new Database(dbPath)
      legacy.exec(`
        CREATE TABLE session_queued_inputs (
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
          updated_at TEXT NOT NULL
        );

        INSERT INTO session_queued_inputs (id, session_id, delivery_mode, state, text, created_at, updated_at)
        VALUES ('q-old', 's1', 'follow-up', 'queued', 'carry on', '2026-01-01', '2026-01-01');
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const row = db
        .prepare("SELECT * FROM session_queued_inputs WHERE id = 'q-old'")
        .get() as { skip_context_injection: number; text: string }

      // Zero is what every input a person typed means: inject as normal.
      expect(row.skip_context_injection).toBe(0)
      expect(row.text).toBe('carry on')
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('carries every column it projects when it rebuilds the sessions table', () => {
    // SYNTHETIC BY CONSTRUCTION. The rebuild fires only on a database carrying
    // a legacy `transcript` column or missing the context-kind CHECK, and every
    // such database predates half of what is seeded here -- no live database
    // reaches this path holding, say, a set `relays_muted`. The test exists to
    // pin the PROJECTION, not the scenario: the rebuild names its columns twice,
    // once in the INSERT and once in the SELECT, and a column dropped from
    // either list silently takes a default. That is the class of bug this
    // guards, and every column below is a member of it.
    //
    // `execution_host` and `execution_host_last_seq` are deliberately absent:
    // the projection does not carry them today, so asserting them here would
    // claim a guarantee this code does not make.
    const dir = mkdtempSync(join(tmpdir(), 'convergence-sessions-rebuild-'))
    const dbPath = join(dir, 'legacy-shape.sqlite')

    try {
      const legacy = new Database(dbPath)
      // No context-kind CHECK in the CREATE, which is what forces the rebuild.
      legacy.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          repository_path TEXT NOT NULL UNIQUE,
          settings TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE workspaces (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          path TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'worktree',
          created_at TEXT NOT NULL,
          UNIQUE(project_id, branch_name),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          context_kind TEXT NOT NULL DEFAULT 'project',
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
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO projects (id, name, repository_path, settings, created_at, updated_at)
        VALUES ('p1', 'p', '/tmp/p1', '{}', '2026-01-01', '2026-01-01');

        INSERT INTO workspaces (id, project_id, branch_name, path, type, created_at)
        VALUES ('w1', 'p1', 'feature', '/tmp/p1-w1', 'worktree', '2026-01-01');

        INSERT INTO sessions (
          id, context_kind, project_id, workspace_id, provider_id, model, effort,
          service_tier, permission_config, continuation_token, name, status,
          attention, working_directory, context_window, activity, relays_muted,
          archived_at, last_sequence, conversation_version, name_auto_generated,
          parent_session_id, fork_strategy, primary_surface, created_at, updated_at
        ) VALUES (
          's-parent', 'project', 'p1', NULL, 'codex', NULL, NULL,
          NULL, '{"preset":"ask"}', NULL, 'parent', 'idle',
          'none', '/tmp/p1', NULL, NULL, 0,
          NULL, 0, 2, 0,
          NULL, NULL, 'conversation', '2026-01-01', '2026-01-01'
        );

        INSERT INTO sessions (
          id, context_kind, project_id, workspace_id, provider_id, model, effort,
          service_tier, permission_config, continuation_token, name, status,
          attention, working_directory, context_window, activity, relays_muted,
          archived_at, last_sequence, conversation_version, name_auto_generated,
          parent_session_id, fork_strategy, primary_surface, created_at, updated_at
        ) VALUES (
          's-rt', 'project', 'p1', 'w1', 'codex', 'gpt-5.6', 'high',
          'priority', '{"preset":"yolo"}', 'token-1', 'round trip', 'completed',
          'finished', '/tmp/p1', '{"availability":"available"}', 'streaming', 1,
          '2026-02-02T00:00:00.000Z', 7, 2, 1,
          's-parent', 'full', 'terminal', '2026-01-01', '2026-01-02'
        );
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const row = db
        .prepare(
          `SELECT id, context_kind, project_id, workspace_id, provider_id, model,
                  effort, service_tier, permission_config, continuation_token,
                  name, status, attention, working_directory, context_window,
                  activity, relays_muted, archived_at, last_sequence,
                  conversation_version, name_auto_generated, parent_session_id,
                  fork_strategy, primary_surface, created_at, updated_at
           FROM sessions WHERE id = 's-rt'`,
        )
        .get()

      expect(row).toEqual({
        id: 's-rt',
        context_kind: 'project',
        project_id: 'p1',
        workspace_id: 'w1',
        provider_id: 'codex',
        model: 'gpt-5.6',
        effort: 'high',
        service_tier: 'priority',
        permission_config: '{"preset":"yolo"}',
        continuation_token: 'token-1',
        name: 'round trip',
        status: 'completed',
        attention: 'finished',
        working_directory: '/tmp/p1',
        context_window: '{"availability":"available"}',
        activity: 'streaming',
        relays_muted: 1,
        archived_at: '2026-02-02T00:00:00.000Z',
        last_sequence: 7,
        conversation_version: 2,
        name_auto_generated: 1,
        parent_session_id: 's-parent',
        fork_strategy: 'full',
        primary_surface: 'terminal',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      })
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('adds the session relay mute to a database that predates the quiet send', () => {
    const dir = mkdtempSync(
      join(tmpdir(), 'convergence-session-mute-migration-'),
    )
    const dbPath = join(dir, 'pre-session-mute.sqlite')

    try {
      const legacy = new Database(dbPath)
      legacy.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          repository_path TEXT NOT NULL UNIQUE,
          settings TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          context_kind TEXT NOT NULL DEFAULT 'project',
          project_id TEXT,
          workspace_id TEXT,
          provider_id TEXT NOT NULL,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'idle',
          attention TEXT NOT NULL DEFAULT 'none',
          working_directory TEXT NOT NULL,
          last_sequence INTEGER NOT NULL DEFAULT 0,
          conversation_version INTEGER NOT NULL DEFAULT 2,
          name_auto_generated INTEGER NOT NULL DEFAULT 0,
          primary_surface TEXT NOT NULL DEFAULT 'conversation',
          execution_host TEXT NOT NULL DEFAULT 'local',
          execution_host_last_seq INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO projects (id, name, repository_path, created_at, updated_at)
        VALUES ('p1', 'p', '/tmp/p1', '2026-01-01', '2026-01-01');

        INSERT INTO sessions (id, project_id, provider_id, name, working_directory, created_at, updated_at)
        VALUES ('s-pre-mute', 'p1', 'codex', 's', '/tmp/p1', '2026-01-01', '2026-01-01');
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const row = db
        .prepare("SELECT relays_muted FROM sessions WHERE id = 's-pre-mute'")
        .get() as { relays_muted: number }

      // Nobody asked for quiet before the quiet send existed, which is exactly
      // what a zero says -- there is nothing to backfill.
      expect(row.relays_muted).toBe(0)
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('adds the queued-input relay mute to a database that predates the quiet send', () => {
    const dir = mkdtempSync(join(tmpdir(), 'convergence-mute-migration-'))
    const dbPath = join(dir, 'pre-mute.sqlite')

    try {
      const legacy = new Database(dbPath)
      legacy.exec(`
        CREATE TABLE session_queued_inputs (
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
          updated_at TEXT NOT NULL
        );

        INSERT INTO session_queued_inputs (id, session_id, delivery_mode, state, text, created_at, updated_at)
        VALUES ('q-pre-mute', 's1', 'follow-up', 'queued', 'carry on', '2026-01-01', '2026-01-01');
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const row = db
        .prepare("SELECT * FROM session_queued_inputs WHERE id = 'q-pre-mute'")
        .get() as { relays_muted: number; text: string }

      // Every message queued before the quiet send existed fired its wires,
      // which is exactly what a zero means -- nothing to backfill.
      expect(row.relays_muted).toBe(0)
      expect(row.text).toBe('carry on')
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('adds the relay instruction and opener columns to a database that predates them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'convergence-relay-migration-'))
    const dbPath = join(dir, 'pre-instruction.sqlite')

    try {
      // The v1 shape, exactly as it shipped: a wire with nowhere to keep a
      // standing brief or a first send. Opening it must add both columns,
      // not lose the wire.
      const legacy = new Database(dbPath)
      legacy.exec(`
        CREATE TABLE session_relays (
          id TEXT PRIMARY KEY,
          crew_id TEXT NOT NULL,
          source_session_id TEXT NOT NULL,
          trigger TEXT NOT NULL DEFAULT 'settled',
          action TEXT NOT NULL,
          target_session_id TEXT,
          spawn_spec_json TEXT,
          armed INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO session_relays (id, crew_id, source_session_id, action, target_session_id)
        VALUES ('r-old', 'c1', 's1', 'hail', 's2');
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const columns = db
        .prepare("PRAGMA table_info('session_relays')")
        .all() as Array<{ name: string }>

      expect(columns.map((column) => column.name)).toContain('instruction')
      expect(columns.map((column) => column.name)).toContain('opener')

      const relay = db
        .prepare("SELECT * FROM session_relays WHERE id = 'r-old'")
        .get() as {
        instruction: string | null
        opener: string | null
        target_session_id: string
      }
      // Null is the honest reading of a wire drawn before briefs existed: it
      // carries the message exactly as it always did.
      expect(relay.instruction).toBeNull()
      expect(relay.opener).toBeNull()
      expect(relay.target_session_id).toBe('s2')
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('migrates legacy initiative rows into spaces', () => {
    const dir = mkdtempSync(join(tmpdir(), 'convergence-space-migration-'))
    const dbPath = join(dir, 'legacy.sqlite')
    const legacyDb = new Database(dbPath)

    try {
      legacyDb.pragma('foreign_keys = ON')
      legacyDb.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          repository_path TEXT NOT NULL UNIQUE,
          settings TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          context_kind TEXT NOT NULL DEFAULT 'project'
            CHECK (context_kind IN ('project', 'global')),
          project_id TEXT,
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
          CHECK (
            (context_kind = 'project' AND project_id IS NOT NULL)
            OR
            (context_kind = 'global' AND project_id IS NULL AND workspace_id IS NULL)
          )
        );

        CREATE TABLE initiatives (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'exploring',
          attention TEXT NOT NULL DEFAULT 'none',
          current_understanding TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE initiative_attempts (
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

        CREATE TABLE initiative_outputs (
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

        INSERT INTO sessions (
          id, context_kind, project_id, workspace_id, provider_id, name, working_directory
        ) VALUES (
          'session-1', 'global', NULL, NULL, 'codex', 'Attempt', '/tmp/global'
        );

        INSERT INTO initiatives (
          id, title, status, attention, current_understanding, created_at, updated_at
        ) VALUES (
          'space-1',
          'Legacy initiative',
          'exploring',
          'needs-decision',
          'Stable context',
          '2026-05-01T10:00:00.000Z',
          '2026-05-01T11:00:00.000Z'
        );

        INSERT INTO initiative_attempts (
          id, initiative_id, session_id, role, is_primary, created_at
        ) VALUES (
          'attempt-1',
          'space-1',
          'session-1',
          'seed',
          1,
          '2026-05-01T10:05:00.000Z'
        );

        INSERT INTO initiative_outputs (
          id, initiative_id, kind, label, value, source_session_id, status,
          created_at, updated_at
        ) VALUES (
          'artifact-1',
          'space-1',
          'documentation',
          'Spec',
          'docs/spec.md',
          'session-1',
          'ready',
          '2026-05-01T10:10:00.000Z',
          '2026-05-01T10:20:00.000Z'
        );
      `)
    } finally {
      legacyDb.close()
    }

    try {
      const db = getDatabase(dbPath)
      const spaces = db.prepare('SELECT * FROM spaces').all()
      const attempts = db.prepare('SELECT * FROM space_attempts').all()
      const artifacts = db.prepare('SELECT * FROM space_artifacts').all()

      expect(spaces).toMatchObject([
        {
          id: 'space-1',
          title: 'Legacy initiative',
          attention: 'needs-decision',
          brief: 'Stable context',
        },
      ])
      expect(attempts).toMatchObject([
        {
          id: 'attempt-1',
          space_id: 'space-1',
          session_id: 'session-1',
          role: 'seed',
          is_primary: 1,
        },
      ])
      expect(artifacts).toMatchObject([
        {
          id: 'artifact-1',
          space_id: 'space-1',
          kind: 'documentation',
          label: 'Spec',
          value: 'docs/spec.md',
          source_session_id: 'session-1',
          status: 'ready',
        },
      ])
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates project_context_items with expected columns and FK', () => {
    const db = getDatabase()
    const columns = db
      .prepare("PRAGMA table_info('project_context_items')")
      .all() as Array<{ name: string; notnull: number }>
    expect(columns.map((c) => c.name).sort()).toEqual(
      [
        'id',
        'project_id',
        'label',
        'body',
        'reinject_mode',
        'created_at',
        'updated_at',
      ].sort(),
    )

    const foreignKeys = db
      .prepare("PRAGMA foreign_key_list('project_context_items')")
      .all() as Array<{ table: string; on_delete: string }>
    expect(foreignKeys.some((fk) => fk.table === 'projects')).toBe(true)
    expect(foreignKeys[0]?.on_delete).toBe('CASCADE')
  })

  it('rejects unknown reinject_mode values via the CHECK constraint', () => {
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p-ctx', 'p', '/tmp/p-ctx')",
    ).run()
    expect(() =>
      db
        .prepare(
          `INSERT INTO project_context_items (id, project_id, body, reinject_mode)
           VALUES (?, ?, ?, ?)`,
        )
        .run('ctx-1', 'p-ctx', 'body', 'bogus'),
    ).toThrow()
  })

  it('cascades project_context_items deletion when its project is deleted', () => {
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p-cas', 'p', '/tmp/p-cas')",
    ).run()
    db.prepare(
      `INSERT INTO project_context_items (id, project_id, body, reinject_mode)
       VALUES ('ctx-cas', 'p-cas', 'body', 'boot')`,
    ).run()

    db.prepare('DELETE FROM projects WHERE id = ?').run('p-cas')

    const remaining = db
      .prepare('SELECT id FROM project_context_items WHERE id = ?')
      .all('ctx-cas')
    expect(remaining).toEqual([])
  })

  it('creates session_context_attachments with expected columns, PK, and FKs', () => {
    const db = getDatabase()
    const columns = db
      .prepare("PRAGMA table_info('session_context_attachments')")
      .all() as Array<{ name: string; pk: number }>
    expect(columns.map((c) => c.name).sort()).toEqual(
      ['session_id', 'context_item_id', 'sort_order'].sort(),
    )
    const pkColumns = columns
      .filter((c) => c.pk > 0)
      .map((c) => c.name)
      .sort()
    expect(pkColumns).toEqual(['context_item_id', 'session_id'])

    const foreignKeys = db
      .prepare("PRAGMA foreign_key_list('session_context_attachments')")
      .all() as Array<{ table: string; on_delete: string }>
    expect(foreignKeys.map((fk) => fk.table).sort()).toEqual(
      ['project_context_items', 'sessions'].sort(),
    )
    for (const fk of foreignKeys) {
      expect(fk.on_delete).toBe('CASCADE')
    }
  })

  it('cascades session_context_attachments when its session or context item is deleted', () => {
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p-att', 'p', '/tmp/p-att')",
    ).run()
    db.prepare(
      "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s-att', 'p-att', 'codex', 's', '/tmp/p-att')",
    ).run()
    db.prepare(
      `INSERT INTO project_context_items (id, project_id, body, reinject_mode)
       VALUES ('ctx-att', 'p-att', 'body', 'boot')`,
    ).run()
    db.prepare(
      `INSERT INTO session_context_attachments (session_id, context_item_id, sort_order)
       VALUES ('s-att', 'ctx-att', 0)`,
    ).run()

    db.prepare('DELETE FROM sessions WHERE id = ?').run('s-att')

    const remainingAfterSessionDelete = db
      .prepare(
        'SELECT session_id FROM session_context_attachments WHERE session_id = ?',
      )
      .all('s-att')
    expect(remainingAfterSessionDelete).toEqual([])

    db.prepare(
      "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s-att2', 'p-att', 'codex', 's2', '/tmp/p-att')",
    ).run()
    db.prepare(
      `INSERT INTO session_context_attachments (session_id, context_item_id, sort_order)
       VALUES ('s-att2', 'ctx-att', 0)`,
    ).run()

    db.prepare('DELETE FROM project_context_items WHERE id = ?').run('ctx-att')

    const remainingAfterItemDelete = db
      .prepare(
        'SELECT context_item_id FROM session_context_attachments WHERE context_item_id = ?',
      )
      .all('ctx-att')
    expect(remainingAfterItemDelete).toEqual([])
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
      const sessionColumns = db
        .prepare("PRAGMA table_info('sessions')")
        .all() as Array<{ name: string }>

      expect(foreignKeys.some((fk) => fk.table === 'sessions')).toBe(false)
      expect(sessionColumns.map((column) => column.name)).not.toContain(
        'transcript',
      )
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('migrates legacy session transcript blobs into normalized conversation rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'convergence-db-test-'))
    const dbPath = join(dir, 'legacy-session.sqlite')

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
      `)

      legacy
        .prepare(
          "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'test', '/tmp/test')",
        )
        .run()
      legacy
        .prepare(
          'INSERT INTO sessions (id, project_id, provider_id, name, working_directory, transcript) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          's1',
          'p1',
          'codex',
          'legacy',
          '/tmp/test',
          JSON.stringify([
            {
              type: 'user',
              text: 'hello',
              timestamp: '2026-01-01T00:00:00.000Z',
            },
            {
              type: 'assistant',
              text: 'hi',
              timestamp: '2026-01-01T00:00:01.000Z',
            },
            {
              type: 'tool-use',
              tool: 'edit_file',
              input: 'src/main.ts',
              timestamp: '2026-01-01T00:00:02.000Z',
            },
          ]),
        )
      legacy.close()

      const db = getDatabase(dbPath)
      const items = db
        .prepare(
          'SELECT sequence, kind, payload_json FROM session_conversation_items WHERE session_id = ? ORDER BY sequence ASC',
        )
        .all('s1') as Array<{
        sequence: number
        kind: string
        payload_json: string
      }>

      const session = db
        .prepare(
          'SELECT context_kind, project_id, last_sequence, conversation_version FROM sessions WHERE id = ?',
        )
        .get('s1') as {
        context_kind: string
        project_id: string | null
        last_sequence: number
        conversation_version: number
      }
      const sessionColumns = db
        .prepare("PRAGMA table_info('sessions')")
        .all() as Array<{ name: string }>

      expect(items).toHaveLength(3)
      expect(items.map((item) => item.kind)).toEqual([
        'message',
        'message',
        'tool-call',
      ])
      expect(session).toEqual({
        context_kind: 'project',
        project_id: 'p1',
        last_sequence: 3,
        conversation_version: 2,
      })
      expect(sessionColumns.map((column) => column.name)).not.toContain(
        'transcript',
      )
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('drops the legacy transcript column when normalized rows already exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'convergence-db-test-'))
    const dbPath = join(dir, 'partially-migrated.sqlite')

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
          last_sequence INTEGER NOT NULL DEFAULT 0,
          conversation_version INTEGER NOT NULL DEFAULT 2,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE session_conversation_items (
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
      `)

      legacy
        .prepare(
          "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'test', '/tmp/test')",
        )
        .run()
      legacy
        .prepare(
          'INSERT INTO sessions (id, project_id, provider_id, name, working_directory, transcript, last_sequence, conversation_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          's1',
          'p1',
          'codex',
          'legacy',
          '/tmp/test',
          JSON.stringify([
            {
              type: 'user',
              text: 'hello',
              timestamp: '2026-01-01T00:00:00.000Z',
            },
            {
              type: 'assistant',
              text: 'hi',
              timestamp: '2026-01-01T00:00:01.000Z',
            },
            {
              type: 'assistant',
              text: 'still streaming',
              timestamp: '2026-01-01T00:00:01.500Z',
              streaming: true,
            },
          ]),
          1,
          2,
        )
      legacy
        .prepare(
          `INSERT INTO session_conversation_items (
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
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          's1:item:1',
          's1',
          1,
          's1:turn:1',
          'message',
          'complete',
          JSON.stringify({
            actor: 'user',
            text: 'hello',
          }),
          null,
          'user',
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
        )
      legacy.close()

      const db = getDatabase(dbPath)
      const sessionColumns = db
        .prepare("PRAGMA table_info('sessions')")
        .all() as Array<{ name: string }>
      const session = db
        .prepare(
          'SELECT last_sequence, conversation_version FROM sessions WHERE id = ?',
        )
        .get('s1') as { last_sequence: number; conversation_version: number }

      expect(sessionColumns.map((column) => column.name)).not.toContain(
        'transcript',
      )
      expect(session).toEqual({
        last_sequence: 1,
        conversation_version: 2,
      })
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('nulls orphaned parent_session_id values while rebuilding legacy sessions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'convergence-db-test-'))
    const dbPath = join(dir, 'legacy-parent-session.sqlite')

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
          parent_session_id TEXT,
          last_sequence INTEGER NOT NULL DEFAULT 0,
          conversation_version INTEGER NOT NULL DEFAULT 2,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE session_conversation_items (
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
      `)

      legacy
        .prepare(
          "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'test', '/tmp/test')",
        )
        .run()
      legacy
        .prepare(
          'INSERT INTO sessions (id, project_id, provider_id, name, working_directory, transcript, parent_session_id, last_sequence, conversation_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'child',
          'p1',
          'codex',
          'child',
          '/tmp/test',
          '[]',
          'missing-parent',
          1,
          2,
        )
      legacy
        .prepare(
          `INSERT INTO session_conversation_items (
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
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'child:item:1',
          'child',
          1,
          'child:turn:1',
          'message',
          'complete',
          JSON.stringify({
            actor: 'user',
            text: 'hello',
          }),
          null,
          'user',
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
        )
      legacy.close()

      const db = getDatabase(dbPath)
      const session = db
        .prepare('SELECT parent_session_id FROM sessions WHERE id = ?')
        .get('child') as { parent_session_id: string | null }
      const violations = db.prepare('PRAGMA foreign_key_check').all() as Array<
        Record<string, unknown>
      >

      expect(session.parent_session_id).toBeNull()
      expect(violations).toEqual([])
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails closed when a legacy transcript blob cannot be parsed safely', () => {
    const dir = mkdtempSync(join(tmpdir(), 'convergence-db-test-'))
    const dbPath = join(dir, 'invalid-legacy-session.sqlite')

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
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
      `)

      legacy
        .prepare(
          "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'test', '/tmp/test')",
        )
        .run()
      legacy
        .prepare(
          'INSERT INTO sessions (id, project_id, provider_id, name, working_directory, transcript) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('s1', 'p1', 'codex', 'legacy', '/tmp/test', '{not-json')
      legacy.close()

      expect(() => getDatabase(dbPath)).toThrow(/invalid JSON/)

      const reopened = new Database(dbPath)
      const sessionColumns = reopened
        .prepare("PRAGMA table_info('sessions')")
        .all() as Array<{ name: string }>
      reopened.close()

      expect(sessionColumns.map((column) => column.name)).toContain(
        'transcript',
      )
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
