import { describe, expect, it, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  getDatabase,
  closeDatabase,
  resetDatabase,
  ensureTurnFileChangeIdentity,
  TURN_FILE_CHANGE_IDENTITY_INDEX,
} from './database'
import { RelayService } from '../relay/relay.service'

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

    // MAR-2609 excised code review, and RULED that these two survive it: code
    // is cheap to reverse and Marcin's generated guides and review notes are
    // not. Nothing reads or writes either table any more, so nothing else in
    // the suite would notice their creation statements being deleted along
    // with the rest of the feature -- which makes a preservation requirement
    // that fails by silent absence. MAR-2615 drops them on his word, and
    // turns this red on purpose.
    expect(tableNames).toContain('review_notes')
    expect(tableNames).toContain('code_review_guides')

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
        'dispatch_id',
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

  it('creates session_turn_file_changes with expected columns, FKs, and identity index', () => {
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

    // A change is identified by turn, repository and path (MAR-2589), and that
    // cannot be a table-level UNIQUE: SQL treats two NULL repo_roots as
    // distinct, so `UNIQUE (turn_id, repo_root, file_path)` would constrain
    // nothing for the rows local capture writes. It is a unique expression
    // index folding null to '' instead -- and the old two-column UNIQUE must be
    // gone, since a leftover would still refuse the second repository's row.
    const indexList = db
      .prepare("PRAGMA index_list('session_turn_file_changes')")
      .all() as Array<{ name: string; unique: number; origin: string }>
    expect(indexList.filter((idx) => idx.origin === 'u')).toEqual([])

    const identityIndex = indexList.find(
      (idx) => idx.name === TURN_FILE_CHANGE_IDENTITY_INDEX,
    )
    expect(identityIndex).toBeDefined()
    expect(identityIndex!.unique).toBe(1)

    const identitySql = (
      db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
        )
        .get(TURN_FILE_CHANGE_IDENTITY_INDEX) as { sql: string }
    ).sql
    expect(identitySql).toContain("COALESCE(repo_root, '')")
    expect(identitySql).toContain('turn_id')
    expect(identitySql).toContain('file_path')
  })

  it('holds one row per turn+path within a repository, and one per repository', () => {
    const db = getDatabase()
    db.pragma('foreign_keys = OFF')
    const insert = db.prepare(
      `INSERT INTO session_turn_file_changes (
         id, session_id, turn_id, repo_root, file_path, old_path, status,
         additions, deletions, diff, truncated, binary, created_at
       ) VALUES (?, 's1', 't1', ?, 'README.md', NULL, 'modified', 0, 0, ?, 0, 0, '2026-08-25')`,
    )

    // Two repositories of one workspace, one path: two changes, two rows. Under
    // the old (turn_id, file_path) key the second of these raised UNIQUE
    // constraint failed, and because turn-capture writes the changes and stamps
    // the turn's ended_at in one transaction, that rollback cost the turn every
    // change and left it running (MAR-2589).
    insert.run('fc-root', null, 'root diff')
    insert.run('fc-web', 'apps/web', 'web diff')
    insert.run('fc-api', 'apps/api', 'api diff')

    // ...and the guarantee that was already there is still there. This is the
    // half the naive `UNIQUE (turn_id, repo_root, file_path)` would have thrown
    // away: repo_root is null for every row local capture has ever written.
    expect(() => insert.run('fc-root-again', null, 'second root diff')).toThrow(
      /UNIQUE constraint failed/,
    )
    expect(() => insert.run('fc-web-again', 'apps/web', 'again')).toThrow(
      /UNIQUE constraint failed/,
    )

    const rows = db
      .prepare(
        `SELECT id, repo_root, diff FROM session_turn_file_changes
         WHERE turn_id = 't1' ORDER BY id ASC`,
      )
      .all() as { id: string; repo_root: string | null; diff: string }[]
    expect(rows).toEqual([
      { id: 'fc-api', repo_root: 'apps/api', diff: 'api diff' },
      { id: 'fc-root', repo_root: null, diff: 'root diff' },
      { id: 'fc-web', repo_root: 'apps/web', diff: 'web diff' },
    ])
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

  it('rebuilds a table keyed the old way without losing a row or a diff byte', () => {
    const dir = mkdtempSync(
      join(tmpdir(), 'convergence-file-change-identity-rebuild-'),
    )
    const dbPath = join(dir, 'pre-identity.sqlite')
    // Just under the 200 KB cap turn capture cuts at, so the copy moves a row
    // of the size this table really holds rather than a token one.
    const bigDiff = `@@ -1 +1 @@\n${'+a line that is here to take up room\n'.repeat(5000)}`

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
          created_at TEXT NOT NULL,
          UNIQUE (turn_id, file_path)
        );
      `)
      legacy
        .prepare(
          `INSERT INTO session_turn_file_changes (
             id, session_id, turn_id, file_path, old_path, status,
             additions, deletions, diff, created_at
           ) VALUES (?, 's1', 't1', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'fc-big',
          'src/big.ts',
          null,
          'modified',
          5000,
          0,
          bigDiff,
          '2026-01-01',
        )
      legacy.exec(`
        INSERT INTO session_turn_file_changes (
          id, session_id, turn_id, file_path, status, additions, deletions, diff, created_at
        ) VALUES
          ('fc-cut', 's1', 't1', 'src/b.ts', 'modified', 0, 0, '[diff truncated: 4210 lines]', '2026-01-02'),
          ('fc-binary', 's1', 't1', 'assets/logo.png', 'modified', 0, 0, '[binary file change]', '2026-01-03'),
          ('fc-renamed', 's1', 't2', 'src/new.ts', 'renamed', 1, 1, '@@ -1 +1 @@', '2026-01-04');
      `)
      legacy.close()

      const db = getDatabase(dbPath)

      // Every row, and every byte of every diff. A rebuild that quietly dropped
      // a column would still leave the right number of rows behind.
      const rows = db
        .prepare(
          `SELECT id, session_id, turn_id, repo_root, file_path, old_path, status,
                  additions, deletions, diff, truncated, binary, created_at
           FROM session_turn_file_changes ORDER BY id ASC`,
        )
        .all() as Array<Record<string, unknown>>
      expect(rows.map((row) => row.id)).toEqual([
        'fc-big',
        'fc-binary',
        'fc-cut',
        'fc-renamed',
      ])
      expect(rows[0]).toEqual({
        id: 'fc-big',
        session_id: 's1',
        turn_id: 't1',
        repo_root: null,
        file_path: 'src/big.ts',
        old_path: null,
        status: 'modified',
        additions: 5000,
        deletions: 0,
        diff: bigDiff,
        truncated: 0,
        binary: 0,
        created_at: '2026-01-01',
      })

      // The MAR-2577 backfill runs first and the rebuild copies what it wrote;
      // a rebuild that ran before it, or that re-created the columns from
      // DEFAULT 0, would put a stand-in where a known-true value belongs.
      expect(rows.map((row) => [row.id, row.truncated, row.binary])).toEqual([
        ['fc-big', 0, 0],
        ['fc-binary', 0, 1],
        ['fc-cut', 1, 0],
        ['fc-renamed', 0, 0],
      ])

      const indexes = db
        .prepare("PRAGMA index_list('session_turn_file_changes')")
        .all() as Array<{ name: string; unique: number; origin: string }>
      expect(indexes.filter((index) => index.origin === 'u')).toEqual([])
      expect(
        indexes.some((index) => index.name === TURN_FILE_CHANGE_IDENTITY_INDEX),
      ).toBe(true)
      expect(
        indexes.some(
          (index) =>
            index.name === 'idx_session_turn_file_changes_session_turn',
        ),
      ).toBe(true)

      // The scratch table the rebuild copies through must not outlive it.
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[]
      expect(tables.map((table) => table.name)).not.toContain(
        'session_turn_file_changes_next',
      )

      // And the point of the whole exercise: two repositories, one path.
      db.pragma('foreign_keys = OFF')
      expect(() =>
        db
          .prepare(
            `INSERT INTO session_turn_file_changes (
               id, session_id, turn_id, repo_root, file_path, status,
               additions, deletions, diff, truncated, binary, created_at
             ) VALUES ('fc-web', 's1', 't1', 'apps/web', 'src/b.ts', 'modified',
                       0, 0, 'web diff', 0, 0, '2026-01-05')`,
          )
          .run(),
      ).not.toThrow()
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('leaves the old table whole when the rebuild is interrupted before the rename', () => {
    const dir = mkdtempSync(
      join(tmpdir(), 'convergence-file-change-identity-interrupt-'),
    )
    const dbPath = join(dir, 'interrupted-rebuild.sqlite')

    try {
      const database = new Database(dbPath)
      // The shape a v0.45.33 database is really in: MAR-2577's columns present,
      // the old two-column UNIQUE still there.
      database.exec(`
        CREATE TABLE session_turn_file_changes (
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
          UNIQUE (turn_id, file_path)
        );

        INSERT INTO session_turn_file_changes (
          id, session_id, turn_id, file_path, status, additions, deletions, diff, created_at
        ) VALUES ('fc-1', 's1', 't1', 'src/a.ts', 'modified', 1, 0, '@@ -1 +1 @@', '2026-01-01');
      `)

      /**
       * A kill between dropping the old table and renaming the new one into its
       * place. That gap is the only moment no table named
       * session_turn_file_changes exists, and a boot that found it open would
       * take SCHEMA's fresh empty table and strand every real row in
       * session_turn_file_changes_next with nothing that knows to look there.
       * A killed process leaves the same durable state as this throw: an
       * uncommitted transaction SQLite rolls back.
       */
      const interrupted = new Proxy(database, {
        get(target, property, receiver) {
          if (property === 'exec') {
            return (sql: string) => {
              if (sql.includes('RENAME TO')) {
                throw new Error('simulated interrupt mid-rebuild')
              }
              return target.exec(sql)
            }
          }
          const value = Reflect.get(target, property, receiver) as unknown
          return typeof value === 'function' ? value.bind(target) : value
        },
      })

      expect(() => ensureTurnFileChangeIdentity(interrupted)).toThrow(
        /simulated interrupt mid-rebuild/,
      )

      const rowsAfterInterrupt = database
        .prepare('SELECT id, diff FROM session_turn_file_changes')
        .all() as { id: string; diff: string }[]
      expect(rowsAfterInterrupt).toEqual([{ id: 'fc-1', diff: '@@ -1 +1 @@' }])
      expect(hasLegacyTwoColumnUnique(database)).toBe(true)
      const tablesAfterInterrupt = (
        database
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as { name: string }[]
      ).map((table) => table.name)
      expect(tablesAfterInterrupt).toContain('session_turn_file_changes')
      expect(tablesAfterInterrupt).not.toContain(
        'session_turn_file_changes_next',
      )

      // The interrupt is over; this boot is the one that gets to finish.
      ensureTurnFileChangeIdentity(database)

      expect(hasLegacyTwoColumnUnique(database)).toBe(false)
      expect(
        database
          .prepare('SELECT id, diff FROM session_turn_file_changes')
          .all(),
      ).toEqual([{ id: 'fc-1', diff: '@@ -1 +1 @@' }])
      database.close()
    } finally {
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
        'round_cap',
        'stall_minutes',
        'created_at',
        'updated_at',
      ].sort(),
    )

    const memberColumns = db
      .prepare("PRAGMA table_info('session_crew_members')")
      .all() as Array<{ name: string }>
    expect(memberColumns.map((c) => c.name).sort()).toEqual(
      ['crew_id', 'session_id', 'baton_name', 'added_at'].sort(),
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
        'condition_token',
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
        'baton',
        'round_number',
        'settled_at',
        'settled_status',
        'dispatch_id',
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
    // The columns a later migration adds are here too, at the defaults those
    // migrations give a legacy row. They used to be deliberately absent because
    // the hand-written projection dropped them; it is derived now, so the
    // guarantee is every column of the destination table (MAR-2689).
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
                  fork_strategy, primary_surface, execution_host,
                  execution_host_last_seq, execution_host_settled_seq,
                  work_address, created_at, updated_at
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
        execution_host: 'local',
        execution_host_last_seq: 0,
        execution_host_settled_seq: 0,
        work_address: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      })
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps a remote session remote, and its place its place, across a rebuild', () => {
    // The two real migration seams, composed: a database that still owes the
    // sessions rebuild AND has not been given `work_address` yet. On one boot
    // the backfill marks its remote rows unknown and the rebuild then threw
    // that away, along with the Endpoint the row named -- every remote session
    // came back as a local one with no place (MAR-2689).
    //
    // Mutation: hand-list the projection again, minus `work_address` (or minus
    // `execution_host`), and this goes red. That is the class: a list nobody
    // re-reads, not the four names it happened to be missing.
    const dir = mkdtempSync(join(tmpdir(), 'convergence-rebuild-address-'))
    const dbPath = join(dir, 'legacy-remote.sqlite')

    try {
      const legacy = new Database(dbPath)
      // No context-kind CHECK, which is what leaves the rebuild owed.
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
          model TEXT,
          effort TEXT,
          permission_config TEXT NOT NULL DEFAULT '{"preset":"ask"}',
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
          execution_host TEXT NOT NULL DEFAULT 'local',
          execution_host_last_seq INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO projects (id, name, repository_path, settings, created_at, updated_at)
        VALUES ('p1', 'p', '/tmp/p1', '{}', '2026-01-01', '2026-01-01');

        INSERT INTO sessions (
          id, context_kind, project_id, provider_id, name, working_directory,
          execution_host, execution_host_last_seq, created_at, updated_at
        ) VALUES
          ('s-remote', 'project', 'p1', 'claude-code', 'on a daemon', '/tmp/p1',
           'little-monster', 42, '2026-01-01', '2026-01-02'),
          ('s-local', 'project', 'p1', 'claude-code', 'here', '/tmp/p1',
           'local', 0, '2026-01-01', '2026-01-02');
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const rows = db
        .prepare(
          `SELECT id, execution_host, execution_host_last_seq, work_address
             FROM sessions ORDER BY id`,
        )
        .all()

      expect(rows).toEqual([
        {
          id: 's-local',
          execution_host: 'local',
          execution_host_last_seq: 0,
          work_address: null,
        },
        {
          id: 's-remote',
          execution_host: 'little-monster',
          execution_host_last_seq: 42,
          work_address: '{"mode":"unknown"}',
        },
      ])
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('carries a place already on record through the rebuild unchanged', () => {
    // The other half: a database that took the work-address migration on an
    // earlier boot and still owes the shape rebuild. A concrete address must
    // arrive on the far side exactly as written -- re-deriving it or dropping
    // it to unknown would both be the record losing what he chose.
    //
    // Mutation: drop `work_address` (or `reported_workspace`) from the
    // projection, and this goes red.
    const dir = mkdtempSync(join(tmpdir(), 'convergence-rebuild-place-'))
    const dbPath = join(dir, 'legacy-place.sqlite')
    const address = JSON.stringify({
      mode: 'project',
      projectId: 'new-blok',
      workingDirectory: '/srv/projects/new-blok',
      label: 'Project new-blok',
    })
    // The daemon's own answer travels with it: two columns, two facts, and the
    // derived projection has to carry a column added after it was written
    // without anyone remembering to (MAR-2694).
    const reported = JSON.stringify({
      mode: 'project',
      projectId: 'new-blok',
      workingDirectory: '/srv/projects/new-blok',
      origin: 'https://github.com/marckraw/new-blok.git',
      originKey: 'github.com/marckraw/new-blok',
      branchName: 'master',
      environment: null,
    })

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
          model TEXT,
          effort TEXT,
          permission_config TEXT NOT NULL DEFAULT '{"preset":"ask"}',
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
          execution_host TEXT NOT NULL DEFAULT 'local',
          work_address TEXT,
          reported_workspace TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO projects (id, name, repository_path, settings, created_at, updated_at)
        VALUES ('p1', 'p', '/tmp/p1', '{}', '2026-01-01', '2026-01-01');
      `)
      legacy
        .prepare(
          `INSERT INTO sessions (
             id, context_kind, project_id, provider_id, name, working_directory,
             execution_host, work_address, reported_workspace, created_at, updated_at
           ) VALUES ('s-placed', 'project', 'p1', 'claude-code', 'placed',
                     '/tmp/p1', 'little-monster', ?, ?, '2026-01-01', '2026-01-02')`,
        )
        .run(address, reported)
      legacy.close()

      const db = getDatabase(dbPath)
      expect(
        db
          .prepare(
            `SELECT execution_host, work_address, reported_workspace
               FROM sessions WHERE id = 's-placed'`,
          )
          .get(),
      ).toEqual({
        execution_host: 'little-monster',
        work_address: address,
        reported_workspace: reported,
      })
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("adds the daemon's reported workspace to a database that predates it", () => {
    // The additive migration, on a database in the modern shape so the rebuild
    // is NOT owed -- otherwise the rebuild's own destination DDL would supply
    // the column and this would pin nothing.
    //
    // Mutation: delete the `ensureSessionReportedWorkspaceColumn(database)`
    // call in `getDatabase` and this goes red. Nothing is backfilled: the app
    // never had the daemon's answer for these rows, and a default is not a
    // known value (MAR-2694).
    const dir = mkdtempSync(join(tmpdir(), 'convergence-reported-workspace-'))
    const dbPath = join(dir, 'pre-reported-workspace.sqlite')

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
          context_kind TEXT NOT NULL DEFAULT 'project'
            CHECK (context_kind IN ('project', 'global')),
          project_id TEXT,
          workspace_id TEXT,
          provider_id TEXT NOT NULL,
          model TEXT,
          effort TEXT,
          permission_config TEXT NOT NULL DEFAULT '{"preset":"ask"}',
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
          execution_host TEXT NOT NULL DEFAULT 'local',
          work_address TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO projects (id, name, repository_path, settings, created_at, updated_at)
        VALUES ('p1', 'p', '/tmp/p1', '{}', '2026-01-01', '2026-01-01');

        INSERT INTO sessions (
          id, context_kind, project_id, provider_id, name, working_directory,
          execution_host, created_at, updated_at
        ) VALUES
          ('s-remote', 'project', 'p1', 'claude-code', 'on a daemon', '/tmp/p1',
           'little-monster', '2026-01-01', '2026-01-02'),
          ('s-local', 'project', 'p1', 'claude-code', 'here', '/tmp/p1',
           'local', '2026-01-01', '2026-01-02');
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      expect(
        (db.pragma('table_info(sessions)') as { name: string }[]).map(
          (column) => column.name,
        ),
      ).toContain('reported_workspace')
      expect(
        db
          .prepare(
            'SELECT id, reported_workspace FROM sessions ORDER BY id ASC',
          )
          .all(),
      ).toEqual([
        { id: 's-local', reported_workspace: null },
        { id: 's-remote', reported_workspace: null },
      ])
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

  it('remembers which event settled a remote session that predates the marker', () => {
    const dir = mkdtempSync(
      join(tmpdir(), 'convergence-settled-seq-migration-'),
    )
    const dbPath = join(dir, 'pre-settled-seq.sqlite')

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
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE SET NULL,
          CHECK (
            (context_kind = 'project' AND project_id IS NOT NULL)
            OR
            (context_kind = 'global' AND project_id IS NULL AND workspace_id IS NULL)
          )
        );

        INSERT INTO projects (id, name, repository_path, created_at, updated_at)
        VALUES ('p1', 'p', '/tmp/p1', '2026-01-01', '2026-01-01');

        INSERT INTO sessions (
          id, project_id, provider_id, name, status, working_directory,
          execution_host, execution_host_last_seq, created_at, updated_at
        ) VALUES
          ('s-remote-done', 'p1', 'claude-code', 's', 'completed', '/tmp/p1', 'remote', 7, '2026-01-01', '2026-01-01'),
          ('s-remote-failed', 'p1', 'claude-code', 's', 'failed', '/tmp/p1', 'remote', 4, '2026-01-01', '2026-01-01'),
          ('s-remote-running', 'p1', 'claude-code', 's', 'running', '/tmp/p1', 'remote', 9, '2026-01-01', '2026-01-01'),
          ('s-remote-silent', 'p1', 'claude-code', 's', 'completed', '/tmp/p1', 'remote', 0, '2026-01-01', '2026-01-01'),
          ('s-local-done', 'p1', 'claude-code', 's', 'completed', '/tmp/p1', 'local', 0, '2026-01-01', '2026-01-01');
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const rows = db
        .prepare(
          'SELECT id, execution_host_settled_seq FROM sessions ORDER BY id ASC',
        )
        .all() as { id: string; execution_host_settled_seq: number }[]

      // For a remote session already at rest the old path still knows the
      // answer: the terminal event was the last one the record applied, so the
      // cursor holds its sequence. A 0 left on those rows would read as "never
      // settled" and let the daemon's next replay end the turn after it
      // (MAR-2582). A run still going has no settle to remember, and a local
      // session has no sequences at all.
      expect(rows).toEqual([
        { id: 's-local-done', execution_host_settled_seq: 0 },
        { id: 's-remote-done', execution_host_settled_seq: 7 },
        { id: 's-remote-failed', execution_host_settled_seq: 4 },
        { id: 's-remote-running', execution_host_settled_seq: 0 },
        { id: 's-remote-silent', execution_host_settled_seq: 0 },
      ])
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('still backfills the settle marker after a migration was interrupted mid-way', () => {
    const dir = mkdtempSync(
      join(tmpdir(), 'convergence-settled-seq-interrupt-'),
    )
    const dbPath = join(dir, 'interrupted-settled-seq.sqlite')

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
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE SET NULL,
          CHECK (
            (context_kind = 'project' AND project_id IS NOT NULL)
            OR
            (context_kind = 'global' AND project_id IS NULL AND workspace_id IS NULL)
          )
        );

        INSERT INTO projects (id, name, repository_path, created_at, updated_at)
        VALUES ('p1', 'p', '/tmp/p1', '2026-01-01', '2026-01-01');

        INSERT INTO sessions (
          id, project_id, provider_id, name, status, working_directory,
          execution_host, execution_host_last_seq, created_at, updated_at
        ) VALUES
          ('s-remote-done', 'p1', 'claude-code', 's', 'completed', '/tmp/p1', 'remote', 7, '2026-01-01', '2026-01-01');

        -- Fails the backfill write, which is the gap between the ALTER and the
        -- UPDATE. A process kill at the same point leaves the same durable
        -- state: an uncommitted transaction SQLite rolls back.
        CREATE TRIGGER interrupt_backfill
        BEFORE UPDATE ON sessions
        BEGIN
          SELECT RAISE(ABORT, 'simulated interrupt mid-migration');
        END;
      `)
      legacy.close()

      expect(() => getDatabase(dbPath)).toThrow(
        'simulated interrupt mid-migration',
      )
      resetDatabase()

      // The column is what decides whether the backfill still needs to run, so
      // it must not survive a backfill that did not. If it did, the next boot
      // would skip the backfill for good and this session would keep a 0 that
      // reads as "never settled".
      const afterCrash = new Database(dbPath)
      const columns = (
        afterCrash.prepare('PRAGMA table_info(sessions)').all() as {
          name: string
        }[]
      ).map((column) => column.name)
      expect(columns).not.toContain('execution_host_settled_seq')
      afterCrash.exec('DROP TRIGGER interrupt_backfill')
      afterCrash.close()

      const db = getDatabase(dbPath)
      const row = db
        .prepare(
          "SELECT execution_host_settled_seq FROM sessions WHERE id = 's-remote-done'",
        )
        .get() as { execution_host_settled_seq: number }
      expect(row.execution_host_settled_seq).toBe(7)
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
        .get() as {
        relays_muted: number
        dispatch_id: string | null
        text: string
      }

      // Every message queued before the quiet send existed fired its wires,
      // which is exactly what a zero means -- nothing to backfill. And no
      // receipt: nothing minted ids before the delivery receipt existed
      // (MAR-2759), so null is the honest reading, not a value to invent.
      expect(row.relays_muted).toBe(0)
      expect(row.dispatch_id).toBeNull()
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

  it('adds the settle ledger columns to a relay trail that predates them', () => {
    // The exact relay_hops v0.46.7 shipped: no baton, no round, no settle
    // stamp, no settle debt. The idempotent ALTERs are the ONLY thing
    // standing between an installed database and `no such column:
    // settled_at` on the very first settle -- where `handleSettle`'s outer
    // catch would silently kill every relay of every settle -- and a test
    // that builds its relay_hops from the fresh SCHEMA never exercises them.
    // Deleting any one of those ALTERs must turn this red; the fresh schema
    // line is NOT the canary, because the ALTER heals its absence.
    const dir = mkdtempSync(join(tmpdir(), 'convergence-settle-migration-'))
    const dbPath = join(dir, 'pre-settle.sqlite')

    try {
      const legacy = new Database(dbPath)
      legacy.exec(`
        CREATE TABLE relay_hops (
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

        INSERT INTO relay_hops (
          id, relay_id, crew_id, flow_run_id, fired_at, source_session_id,
          target_session_id, trigger_status, outcome
        )
        VALUES ('hop-old', 'r1', 'c1', 'run-1', '2026-08-30T10:00:00.000Z',
                's1', 's2', 'completed', 'delivered');
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const columns = (
        db.prepare("PRAGMA table_info('relay_hops')").all() as Array<{
          name: string
        }>
      ).map((column) => column.name)
      expect(columns).toContain('settled_at')
      expect(columns).toContain('settled_status')
      expect(columns).toContain('dispatch_id')

      const hop = db
        .prepare("SELECT * FROM relay_hops WHERE id = 'hop-old'")
        .get() as {
        settled_at: string | null
        settled_status: string | null
        dispatch_id: string | null
        outcome: string
      }
      // Null is the honest reading -- nothing recorded a station's return
      // or minted a receipt before these columns -- and a null receipt is
      // exactly what keeps the old first-answer stamp for these rows.
      expect(hop.settled_at).toBeNull()
      expect(hop.settled_status).toBeNull()
      expect(hop.dispatch_id).toBeNull()
      expect(hop.outcome).toBe('delivered')

      // The write path itself, against the migrated table: the first settle
      // of the installed build must stamp, not throw.
      const service = new RelayService(db)
      expect(
        service.markStationSettled(
          's2',
          'completed',
          '2026-08-30T10:05:00.000Z',
          [],
        ),
      ).toBe(1)
      expect(
        db
          .prepare("SELECT settled_status FROM relay_hops WHERE id = 'hop-old'")
          .get(),
      ).toEqual({ settled_status: 'completed' })
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('drops the settle debt from a trail that carried it, keeping the rows', () => {
    // The dev-era shape between v0.46.7 and the delivery receipt: a trail
    // with a `settles_owed` count. The count was a target-status guess at
    // the causal question the dispatch id answers by identity (MAR-2759),
    // and a column nobody reads would only invite a reader -- so opening
    // such a database must remove it WITHOUT losing a single hop. Deleting
    // the DROP ALTER turns this red; the fresh schema cannot, because it
    // never had the column.
    const dir = mkdtempSync(join(tmpdir(), 'convergence-debt-drop-'))
    const dbPath = join(dir, 'pre-receipt.sqlite')

    try {
      const legacy = new Database(dbPath)
      legacy.exec(`
        CREATE TABLE relay_hops (
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
          baton TEXT,
          round_number INTEGER,
          settled_at TEXT,
          settled_status TEXT,
          settles_owed INTEGER NOT NULL DEFAULT 0,
          error TEXT
        );

        INSERT INTO relay_hops (
          id, relay_id, crew_id, flow_run_id, fired_at, source_session_id,
          target_session_id, trigger_status, outcome, settles_owed
        )
        VALUES ('hop-debt', 'r1', 'c1', 'run-1', '2026-08-31T10:00:00.000Z',
                's1', 's2', 'completed', 'queued', 1);
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const columns = (
        db.prepare("PRAGMA table_info('relay_hops')").all() as Array<{
          name: string
        }>
      ).map((column) => column.name)
      expect(columns).not.toContain('settles_owed')
      expect(columns).toContain('dispatch_id')

      const hop = db
        .prepare("SELECT * FROM relay_hops WHERE id = 'hop-debt'")
        .get() as { dispatch_id: string | null; outcome: string }
      expect(hop.outcome).toBe('queued')
      expect(hop.dispatch_id).toBeNull()
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('adds the debt identity to a hail book that predates it', () => {
    // The dev-era `crew_hails` without `hop_id`. The idempotent ALTER is the
    // only thing between that book and `no such column: hop_id` on the very
    // next stall tick -- the fresh CREATE cannot exercise it, because it
    // ships the column. Null on old rows is honest: nothing recorded which
    // hop they accused.
    const dir = mkdtempSync(join(tmpdir(), 'convergence-hail-identity-'))
    const dbPath = join(dir, 'pre-identity.sqlite')

    try {
      const legacy = new Database(dbPath)
      legacy.exec(`
        CREATE TABLE crew_hails (
          id TEXT PRIMARY KEY,
          crew_id TEXT NOT NULL,
          flow_run_id TEXT,
          reason TEXT NOT NULL,
          session_id TEXT NOT NULL,
          baton TEXT,
          message TEXT,
          detail TEXT NOT NULL,
          raised_at TEXT NOT NULL DEFAULT (datetime('now')),
          acknowledged_at TEXT
        );

        INSERT INTO crew_hails (id, crew_id, reason, session_id, detail)
        VALUES ('hail-old', 'c1', 'stall', 's2', 'quiet for 30 minutes');
      `)
      legacy.close()

      const db = getDatabase(dbPath)
      const row = db
        .prepare("SELECT * FROM crew_hails WHERE id = 'hail-old'")
        .get() as { hop_id: string | null; reason: string }
      expect(row.hop_id).toBeNull()
      expect(row.reason).toBe('stall')
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
// MAR-2620: the single remote daemon becomes the first Endpoint, and the two
// sessions that ran on it stop saying `'remote'` and start saying which.
const LEGACY_SCHEMA = `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repository_path TEXT NOT NULL UNIQUE,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE SET NULL,
    CHECK (
      (context_kind = 'project' AND project_id IS NOT NULL)
      OR
      (context_kind = 'global' AND project_id IS NULL AND workspace_id IS NULL)
    )
  );

  INSERT INTO projects (id, name, repository_path, created_at, updated_at)
  VALUES ('p1', 'p', '/tmp/p1', '2026-01-01', '2026-01-01');

  INSERT INTO sessions (
    id, project_id, provider_id, name, status, working_directory,
    execution_host, created_at, updated_at
  ) VALUES
    ('s-remote-a', 'p1', 'claude-code', 's', 'completed', '/tmp/p1', 'remote', '2026-01-01', '2026-01-01'),
    ('s-remote-b', 'p1', 'claude-code', 's', 'failed', '/tmp/p1', 'remote', '2026-01-01', '2026-01-01'),
    ('s-local', 'p1', 'claude-code', 's', 'completed', '/tmp/p1', 'local', '2026-01-01', '2026-01-01');
`

function seedLegacy(dbPath: string, settingsJson: string | null): void {
  const legacy = new Database(dbPath)
  legacy.exec(LEGACY_SCHEMA)
  if (settingsJson !== null) {
    legacy
      .prepare('INSERT INTO app_state (key, value) VALUES (?, ?)')
      .run('app_settings', settingsJson)
  }
  legacy.close()
}

/** Seeds the pre-Endpoint schema and hands the path back, for chaining. */
function seedLegacyAt(dbPath: string): string {
  seedLegacy(dbPath, null)
  return dbPath
}

function withTempDb(name: string, run: (dbPath: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), `convergence-${name}-`))
  try {
    run(join(dir, `${name}.sqlite`))
  } finally {
    closeDatabase()
    resetDatabase()
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * A remote session says where it worked, and a pre-era one says it does not
 * know (MAR-2689).
 *
 * The column is additive, so the interesting claims are all about the backfill:
 * that it happens, that it invents nothing, that it leaves local rows alone,
 * and that it cannot be half-done. The last one is the reason the column and
 * the `UPDATE` share a transaction — the column's presence is itself the flag
 * that says the backfill is still owed, so an interrupt in the gap would be
 * permanent.
 */
describe('session work address migration', () => {
  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('marks every pre-era remote row unknown and leaves local rows blank', () => {
    withTempDb('work-address-migration', (dbPath) => {
      const db = getDatabase(seedLegacyAt(dbPath))

      expect(
        db
          .prepare('SELECT id, work_address FROM sessions ORDER BY id ASC')
          .all(),
      ).toEqual([
        { id: 's-local', work_address: null },
        { id: 's-remote-a', work_address: '{"mode":"unknown"}' },
        { id: 's-remote-b', work_address: '{"mode":"unknown"}' },
      ])
    })
  })

  it('never guesses a repository for a row whose place was not recorded', () => {
    withTempDb('work-address-no-guess', (dbPath) => {
      const db = getDatabase(seedLegacyAt(dbPath))

      // The rows have a working directory and the app could still read its
      // origin -- and that origin is wherever the checkout points *today*, not
      // where the session was told to work. A default is not a known value.
      const addresses = db
        .prepare(
          "SELECT work_address FROM sessions WHERE execution_host != 'local'",
        )
        .all() as { work_address: string }[]
      for (const row of addresses) {
        expect(row.work_address).not.toContain('repository')
        expect(row.work_address).not.toContain('/tmp/p1')
      }
    })
  })

  it('leaves the column absent when the backfill is interrupted, and completes it on the next boot', () => {
    withTempDb('work-address-interrupt', (dbPath) => {
      seedLegacyAt(dbPath)

      // The real seam: the `ALTER TABLE` succeeds and the `UPDATE` that owes
      // the backfill does not. A trigger is the only way to make SQLite refuse
      // the write from outside the code under test, and it refuses exactly the
      // statement the transaction exists to protect.
      const armed = new Database(dbPath)
      armed.exec(`
        CREATE TRIGGER refuse_backfill BEFORE UPDATE ON sessions
        BEGIN SELECT RAISE(ABORT, 'interrupted'); END;
      `)
      armed.close()

      expect(() => getDatabase(dbPath)).toThrow()
      closeDatabase()
      resetDatabase()

      // Nothing landed. The column is the flag, so a column present with no
      // backfill behind it would make the next boot skip the work for good.
      const after = new Database(dbPath)
      const columns = (
        after.pragma('table_info(sessions)') as { name: string }[]
      ).map((column) => column.name)
      expect(columns).not.toContain('work_address')
      after.exec('DROP TRIGGER refuse_backfill')
      after.close()

      const db = getDatabase(dbPath)
      expect(
        db
          .prepare(
            'SELECT COUNT(*) AS n FROM sessions WHERE work_address = \'{"mode":"unknown"}\'',
          )
          .get(),
      ).toEqual({ n: 2 })
    })
  })
})

describe('execution host endpoints migration', () => {
  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('makes the configured daemon the first endpoint and lands legacy remote rows on it', () => {
    withTempDb('endpoint-migration', (dbPath) => {
      seedLegacy(
        dbPath,
        JSON.stringify({
          defaultProviderId: 'claude-code',
          executionHostRemoteBaseUrl: 'https://daemon.example.com/',
        }),
      )

      const db = getDatabase(dbPath)

      // The base URL still in settings is the only daemon those rows could
      // have run on, so it is the answer the record still knows.
      expect(
        db.prepare('SELECT * FROM execution_host_endpoints').all(),
      ).toEqual([
        {
          id: 'default',
          label: 'Remote daemon',
          base_url: 'https://daemon.example.com',
          position: 0,
          created_at: expect.any(String),
          updated_at: expect.any(String),
        },
      ])

      expect(
        db
          .prepare('SELECT id, execution_host FROM sessions ORDER BY id ASC')
          .all(),
      ).toEqual([
        { id: 's-local', execution_host: 'local' },
        { id: 's-remote-a', execution_host: 'default' },
        { id: 's-remote-b', execution_host: 'default' },
      ])

      // One encoding of one fact: the endpoint row is now the only place the
      // base URL lives, so the settings blob must not keep a copy to drift
      // from.
      const settings = JSON.parse(
        (
          db
            .prepare("SELECT value FROM app_state WHERE key = 'app_settings'")
            .get() as { value: string }
        ).value,
      ) as Record<string, unknown>
      expect(settings).not.toHaveProperty('executionHostRemoteBaseUrl')
      expect(settings.defaultProviderId).toBe('claude-code')
    })
  })

  it('marks legacy remote rows unattributable when no base URL survives', () => {
    withTempDb('endpoint-migration-no-url', (dbPath) => {
      seedLegacy(dbPath, JSON.stringify({ defaultProviderId: 'claude-code' }))

      const db = getDatabase(dbPath)

      // Nothing is invented: with no address left in the record there is no
      // honest Endpoint to attribute these runs to, so they take the reserved
      // id that matches none and refuses to resolve.
      expect(
        db.prepare('SELECT * FROM execution_host_endpoints').all(),
      ).toEqual([])
      expect(
        db
          .prepare('SELECT id, execution_host FROM sessions ORDER BY id ASC')
          .all(),
      ).toEqual([
        { id: 's-local', execution_host: 'local' },
        { id: 's-remote-a', execution_host: 'legacy-remote' },
        { id: 's-remote-b', execution_host: 'legacy-remote' },
      ])
    })
  })

  it('leaves local sessions byte-identical', () => {
    withTempDb('endpoint-migration-local', (dbPath) => {
      seedLegacy(
        dbPath,
        JSON.stringify({
          executionHostRemoteBaseUrl: 'https://daemon.example.com',
        }),
      )

      const before = new Database(dbPath)
      const localBefore = before
        .prepare("SELECT * FROM sessions WHERE id = 's-local'")
        .get()
      const totalBefore = before
        .prepare('SELECT COUNT(*) AS n FROM sessions')
        .get() as { n: number }
      before.close()

      const db = getDatabase(dbPath)
      const localAfter = db
        .prepare("SELECT * FROM sessions WHERE id = 's-local'")
        .get() as Record<string, unknown>

      // Every column this row already had, unchanged. Compared field by field
      // against the row as it stood rather than whole, because boot also adds
      // the columns later releases introduced -- `work_address` below is one
      // (MAR-2689). Additive columns are exactly what a migration is allowed to
      // do to a local row; changing a value it already held is not.
      for (const [column, value] of Object.entries(
        localBefore as Record<string, unknown>,
      )) {
        expect(localAfter[column]).toEqual(value)
      }
      // And the additive one says nothing: a local session works in the
      // directory this row already names, so it has no work address at all.
      expect(localAfter.work_address).toBeNull()
      expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual(
        totalBefore,
      )
    })
  })

  it('rolls the whole migration back when it is interrupted, and re-runs it on the next boot', () => {
    withTempDb('endpoint-migration-interrupt', (dbPath) => {
      seedLegacy(
        dbPath,
        JSON.stringify({
          executionHostRemoteBaseUrl: 'https://daemon.example.com',
        }),
      )

      const armed = new Database(dbPath)
      // Fires on the session backfill, which runs after the table has been
      // created and seeded — the same durable state a process kill in that gap
      // would leave, since SQLite rolls an uncommitted transaction back.
      armed.exec(`
        CREATE TRIGGER interrupt_backfill
        BEFORE UPDATE ON sessions
        BEGIN
          SELECT RAISE(ABORT, 'simulated interrupt mid-migration');
        END;
      `)
      armed.close()

      expect(() => getDatabase(dbPath)).toThrow(
        'simulated interrupt mid-migration',
      )
      resetDatabase()

      // The table's existence is what says the backfill is done, so it must not
      // survive a backfill that did not — and the base URL that explains those
      // rows must still be in settings, or the retry has nothing left to
      // attribute them to.
      const afterCrash = new Database(dbPath)
      expect(
        afterCrash
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'execution_host_endpoints'",
          )
          .get(),
      ).toBeUndefined()
      expect(
        afterCrash
          .prepare(
            "SELECT execution_host FROM sessions WHERE id = 's-remote-a'",
          )
          .get(),
      ).toEqual({ execution_host: 'remote' })
      expect(
        (
          afterCrash
            .prepare("SELECT value FROM app_state WHERE key = 'app_settings'")
            .get() as { value: string }
        ).value,
      ).toContain('executionHostRemoteBaseUrl')
      afterCrash.exec('DROP TRIGGER interrupt_backfill')
      afterCrash.close()

      const db = getDatabase(dbPath)
      expect(
        db.prepare('SELECT id FROM execution_host_endpoints').all(),
      ).toEqual([{ id: 'default' }])
      expect(
        db
          .prepare(
            "SELECT execution_host FROM sessions WHERE id = 's-remote-a'",
          )
          .get(),
      ).toEqual({ execution_host: 'default' })
    })
  })
})

function hasLegacyTwoColumnUnique(database: Database.Database): boolean {
  const indexes = database
    .prepare("PRAGMA index_list('session_turn_file_changes')")
    .all() as Array<{ name: string; origin: string }>
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
