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
    expect(tableNames).toContain('initiatives')
    expect(tableNames).toContain('initiative_attempts')
    expect(tableNames).toContain('initiative_outputs')
    expect(tableNames).toContain('project_context_items')
    expect(tableNames).toContain('session_context_attachments')
    expect(tableNames).toContain('analytics_profile_snapshots')

    const sessionColumns = db
      .prepare("PRAGMA table_info('sessions')")
      .all() as Array<{ name: string }>
    const columnNames = sessionColumns.map((column) => column.name)
    expect(columnNames).not.toContain('transcript')
    expect(columnNames).toContain('primary_surface')
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
        'file_path',
        'old_path',
        'status',
        'additions',
        'deletions',
        'diff',
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

  it('creates initiative tables with expected constraints', () => {
    const db = getDatabase()
    const initiativeColumns = db
      .prepare("PRAGMA table_info('initiatives')")
      .all() as Array<{ name: string }>
    expect(initiativeColumns.map((c) => c.name).sort()).toEqual(
      [
        'id',
        'title',
        'status',
        'attention',
        'current_understanding',
        'created_at',
        'updated_at',
      ].sort(),
    )

    const attemptForeignKeys = db
      .prepare("PRAGMA foreign_key_list('initiative_attempts')")
      .all() as Array<{ table: string; on_delete: string }>
    expect(attemptForeignKeys.map((fk) => fk.table).sort()).toEqual(
      ['initiatives', 'sessions'].sort(),
    )
    for (const fk of attemptForeignKeys) {
      expect(fk.on_delete).toBe('CASCADE')
    }

    const outputForeignKeys = db
      .prepare("PRAGMA foreign_key_list('initiative_outputs')")
      .all() as Array<{ table: string; on_delete: string }>
    expect(outputForeignKeys.map((fk) => fk.table).sort()).toEqual(
      ['initiatives', 'sessions'].sort(),
    )
    expect(
      outputForeignKeys.some(
        (fk) => fk.table === 'sessions' && fk.on_delete === 'SET NULL',
      ),
    ).toBe(true)
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
          'SELECT last_sequence, conversation_version FROM sessions WHERE id = ?',
        )
        .get('s1') as { last_sequence: number; conversation_version: number }
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
