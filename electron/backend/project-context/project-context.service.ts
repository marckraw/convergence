import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { ProjectContextItemRow } from '../database/database.types'
import {
  projectContextItemFromRow,
  type CreateProjectContextItemInput,
  type ProjectContextItem,
  type UpdateProjectContextItemInput,
} from './project-context.types'

function normalizeBody(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length === 0) {
    throw new Error('Project context item body cannot be empty')
  }
  return trimmed
}

function normalizeLabel(label: string | null | undefined): string | null {
  if (label === undefined || label === null) return null
  const trimmed = label.trim()
  return trimmed.length === 0 ? null : trimmed
}

export class ProjectContextService {
  constructor(private db: Database.Database) {}

  list(projectId: string): ProjectContextItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_context_items
         WHERE project_id = ?
         ORDER BY created_at ASC`,
      )
      .all(projectId) as ProjectContextItemRow[]
    return rows.map(projectContextItemFromRow)
  }

  getById(id: string): ProjectContextItem | null {
    const row = this.db
      .prepare('SELECT * FROM project_context_items WHERE id = ?')
      .get(id) as ProjectContextItemRow | undefined
    return row ? projectContextItemFromRow(row) : null
  }

  create(input: CreateProjectContextItemInput): ProjectContextItem {
    this.assertProjectExists(input.projectId)
    const body = normalizeBody(input.body)
    const label = normalizeLabel(input.label)

    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO project_context_items (
           id, project_id, label, body, reinject_mode
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, input.projectId, label, body, input.reinjectMode)

    return this.getById(id)!
  }

  update(id: string, patch: UpdateProjectContextItemInput): ProjectContextItem {
    const existing = this.getById(id)
    if (!existing) {
      throw new Error(`Project context item not found: ${id}`)
    }

    const body =
      patch.body === undefined ? existing.body : normalizeBody(patch.body)
    const label =
      patch.label === undefined ? existing.label : normalizeLabel(patch.label)
    const reinjectMode = patch.reinjectMode ?? existing.reinjectMode

    this.db
      .prepare(
        `UPDATE project_context_items
         SET label = ?,
             body = ?,
             reinject_mode = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(label, body, reinjectMode, id)

    return this.getById(id)!
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM project_context_items WHERE id = ?').run(id)
  }

  attachToSession(sessionId: string, itemIds: string[]): void {
    this.assertSessionExists(sessionId)
    for (const itemId of itemIds) {
      if (!this.getById(itemId)) {
        throw new Error(`Project context item not found: ${itemId}`)
      }
    }
    const tx = this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM session_context_attachments WHERE session_id = ?')
        .run(sessionId)
      const insert = this.db.prepare(
        `INSERT INTO session_context_attachments
           (session_id, context_item_id, sort_order)
         VALUES (?, ?, ?)`,
      )
      itemIds.forEach((itemId, index) => {
        insert.run(sessionId, itemId, index)
      })
    })
    tx()
  }

  listForSession(sessionId: string): ProjectContextItem[] {
    const rows = this.db
      .prepare(
        `SELECT items.*
         FROM session_context_attachments att
         INNER JOIN project_context_items items
           ON items.id = att.context_item_id
         WHERE att.session_id = ?
         ORDER BY att.sort_order ASC`,
      )
      .all(sessionId) as ProjectContextItemRow[]
    return rows.map(projectContextItemFromRow)
  }

  private assertProjectExists(projectId: string): void {
    const row = this.db
      .prepare('SELECT id FROM projects WHERE id = ?')
      .get(projectId)
    if (!row) {
      throw new Error(`Project not found: ${projectId}`)
    }
  }

  private assertSessionExists(sessionId: string): void {
    const row = this.db
      .prepare('SELECT id FROM sessions WHERE id = ?')
      .get(sessionId)
    if (!row) {
      throw new Error(`Session not found: ${sessionId}`)
    }
  }
}
