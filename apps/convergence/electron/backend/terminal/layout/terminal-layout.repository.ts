import type Database from 'better-sqlite3'
import type { PersistedPaneTree } from './terminal-layout.types'

interface LayoutRow {
  session_id: string
  layout_json: string
  updated_at: string
}

export class TerminalLayoutRepository {
  private readonly selectStmt: Database.Statement<
    [string],
    LayoutRow | undefined
  >
  private readonly upsertStmt: Database.Statement<[string, string, string]>
  private readonly deleteStmt: Database.Statement<[string]>

  constructor(private readonly db: Database.Database) {
    this.selectStmt = db.prepare(
      'SELECT session_id, layout_json, updated_at FROM session_terminal_layout WHERE session_id = ?',
    ) as Database.Statement<[string], LayoutRow | undefined>
    this.upsertStmt = db.prepare(
      `INSERT INTO session_terminal_layout (session_id, layout_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         layout_json = excluded.layout_json,
         updated_at = excluded.updated_at`,
    ) as Database.Statement<[string, string, string]>
    this.deleteStmt = db.prepare(
      'DELETE FROM session_terminal_layout WHERE session_id = ?',
    ) as Database.Statement<[string]>
  }

  get(sessionId: string): PersistedPaneTree | null {
    const row = this.selectStmt.get(sessionId)
    if (!row) return null
    try {
      return JSON.parse(row.layout_json) as PersistedPaneTree
    } catch {
      return null
    }
  }

  upsert(sessionId: string, tree: PersistedPaneTree, updatedAt: string): void {
    this.upsertStmt.run(sessionId, JSON.stringify(tree), updatedAt)
  }

  delete(sessionId: string): void {
    this.deleteStmt.run(sessionId)
  }
}
