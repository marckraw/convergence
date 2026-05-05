import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { ReviewNoteRow } from '../database/database.types'
import {
  parseReviewNoteMode,
  parseReviewNoteState,
  reviewNoteFromRow,
  type CreateReviewNoteInput,
  type ReviewNote,
  type ReviewNoteMode,
  type ReviewNoteState,
  type UpdateReviewNoteInput,
} from './review-notes.types'

function normalizeRequiredText(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`${label} cannot be empty`)
  }
  return trimmed
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function normalizeLine(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Review note line numbers must be positive integers')
  }
  return value
}

function normalizeMode(mode: ReviewNoteMode): ReviewNoteMode {
  return parseReviewNoteMode(mode)
}

function normalizeState(state: ReviewNoteState): ReviewNoteState {
  return parseReviewNoteState(state)
}

export class ReviewNotesService {
  constructor(private db: Database.Database) {}

  listBySession(sessionId: string): ReviewNote[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM review_notes
         WHERE session_id = ?
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(sessionId) as ReviewNoteRow[]
    return rows.map(reviewNoteFromRow)
  }

  getById(id: string): ReviewNote | null {
    const row = this.db
      .prepare('SELECT * FROM review_notes WHERE id = ?')
      .get(id) as ReviewNoteRow | undefined
    return row ? reviewNoteFromRow(row) : null
  }

  create(input: CreateReviewNoteInput): ReviewNote {
    this.assertSessionExists(input.sessionId)
    if (input.workspaceId) {
      this.assertWorkspaceExists(input.workspaceId)
    }

    const id = randomUUID()
    const filePath = normalizeRequiredText(input.filePath, 'Review note file')
    const mode = normalizeMode(input.mode)
    const selectedDiff = normalizeRequiredText(
      input.selectedDiff,
      'Review note selection',
    )
    const body = normalizeRequiredText(input.body, 'Review note body')

    this.db
      .prepare(
        `INSERT INTO review_notes (
           id,
           session_id,
           workspace_id,
           file_path,
           mode,
           old_start_line,
           old_end_line,
           new_start_line,
           new_end_line,
           hunk_header,
           selected_diff,
           body,
           state
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      )
      .run(
        id,
        input.sessionId,
        input.workspaceId ?? null,
        filePath,
        mode,
        normalizeLine(input.oldStartLine),
        normalizeLine(input.oldEndLine),
        normalizeLine(input.newStartLine),
        normalizeLine(input.newEndLine),
        normalizeOptionalText(input.hunkHeader),
        selectedDiff,
        body,
      )

    return this.getById(id)!
  }

  update(id: string, patch: UpdateReviewNoteInput): ReviewNote {
    const existing = this.getById(id)
    if (!existing) {
      throw new Error(`Review note not found: ${id}`)
    }

    const body =
      patch.body === undefined
        ? existing.body
        : normalizeRequiredText(patch.body, 'Review note body')
    const state =
      patch.state === undefined ? existing.state : normalizeState(patch.state)
    const sentAt = state === 'sent' && existing.sentAt === null ? true : false

    this.db
      .prepare(
        `UPDATE review_notes
         SET body = ?,
             state = ?,
             sent_at = CASE WHEN ? THEN datetime('now') ELSE sent_at END,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(body, state, sentAt ? 1 : 0, id)

    return this.getById(id)!
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM review_notes WHERE id = ?').run(id)
  }

  private assertSessionExists(sessionId: string): void {
    const row = this.db
      .prepare('SELECT id FROM sessions WHERE id = ?')
      .get(sessionId)
    if (!row) {
      throw new Error(`Session not found: ${sessionId}`)
    }
  }

  private assertWorkspaceExists(workspaceId: string): void {
    const row = this.db
      .prepare('SELECT id FROM workspaces WHERE id = ?')
      .get(workspaceId)
    if (!row) {
      throw new Error(`Workspace not found: ${workspaceId}`)
    }
  }
}
