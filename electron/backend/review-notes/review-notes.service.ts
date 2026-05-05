import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { ReviewNoteRow } from '../database/database.types'
import { workspacePullRequestFromRow } from '../pull-request/pull-request.types'
import { buildReviewNotePacket } from './review-note-prompt.pure'
import {
  parseReviewNoteMode,
  parseReviewNoteState,
  reviewNoteFromRow,
  type CreateReviewNoteInput,
  type PreviewReviewNotePacketInput,
  type ReviewNote,
  type ReviewNotePacketPreview,
  type ReviewNotePacketSendResult,
  type ReviewNoteMode,
  type ReviewNoteState,
  type SendReviewNotePacketInput,
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
    // Keep sentAt as the first-send timestamp, even if a sent note is reopened
    // and sent again later.
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

  previewPacket(input: PreviewReviewNotePacketInput): ReviewNotePacketPreview {
    const session = this.getSessionPacketContext(input.sessionId)
    const selectedNotes = this.resolvePacketNotes(input)

    return buildReviewNotePacket({
      notes: selectedNotes,
      session: {
        sessionId: session.id,
        projectName: session.projectName,
        workspacePath: session.workspacePath,
        workspaceBranchName: session.workspaceBranchName,
        workingDirectory: session.workingDirectory,
      },
      pullRequest: session.pullRequest,
    })
  }

  async sendPacket(
    input: SendReviewNotePacketInput,
    sendMessage: (sessionId: string, text: string) => Promise<void>,
  ): Promise<ReviewNotePacketSendResult> {
    const packet = this.previewPacket(input)
    if (packet.noteCount === 0) {
      throw new Error('Cannot send a review packet without review notes')
    }

    await sendMessage(input.sessionId, packet.text)
    const sentNotes = this.markPacketNotesSent(input)

    return {
      ...packet,
      sentNotes,
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

  private assertWorkspaceExists(workspaceId: string): void {
    const row = this.db
      .prepare('SELECT id FROM workspaces WHERE id = ?')
      .get(workspaceId)
    if (!row) {
      throw new Error(`Workspace not found: ${workspaceId}`)
    }
  }

  private resolvePacketNotes(
    input: PreviewReviewNotePacketInput,
  ): ReviewNote[] {
    const notes = this.listBySession(input.sessionId)
    const noteIds = input.noteIds ? new Set(input.noteIds) : null
    return notes.filter((note) =>
      noteIds ? noteIds.has(note.id) : note.state === 'draft',
    )
  }

  private markPacketNotesSent(input: SendReviewNotePacketInput): ReviewNote[] {
    const notes = this.resolvePacketNotes(input)
    const tx = this.db.transaction((noteIds: string[]) => {
      for (const noteId of noteIds) {
        this.db
          .prepare(
            `UPDATE review_notes
             SET state = 'sent',
                 sent_at = COALESCE(sent_at, datetime('now')),
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
          .run(noteId)
      }
    })
    tx(notes.map((note) => note.id))

    return notes
      .map((note) => this.getById(note.id))
      .filter((note): note is ReviewNote => note !== null)
  }

  private getSessionPacketContext(sessionId: string): {
    id: string
    projectName: string | null
    workspacePath: string | null
    workspaceBranchName: string | null
    workingDirectory: string
    pullRequest: ReturnType<typeof workspacePullRequestFromRow> | null
  } {
    const row = this.db
      .prepare(
        `SELECT
           sessions.id,
           sessions.working_directory,
           projects.name AS project_name,
           workspaces.path AS workspace_path,
           workspaces.branch_name AS workspace_branch_name,
           workspace_pull_requests.id AS pr_id,
           workspace_pull_requests.project_id AS pr_project_id,
           workspace_pull_requests.workspace_id AS pr_workspace_id,
           workspace_pull_requests.provider AS pr_provider,
           workspace_pull_requests.lookup_status AS pr_lookup_status,
           workspace_pull_requests.state AS pr_state,
           workspace_pull_requests.repository_owner AS pr_repository_owner,
           workspace_pull_requests.repository_name AS pr_repository_name,
           workspace_pull_requests.number AS pr_number,
           workspace_pull_requests.title AS pr_title,
           workspace_pull_requests.url AS pr_url,
           workspace_pull_requests.is_draft AS pr_is_draft,
           workspace_pull_requests.head_branch AS pr_head_branch,
           workspace_pull_requests.base_branch AS pr_base_branch,
           workspace_pull_requests.merged_at AS pr_merged_at,
           workspace_pull_requests.last_checked_at AS pr_last_checked_at,
           workspace_pull_requests.error AS pr_error,
           workspace_pull_requests.created_at AS pr_created_at,
           workspace_pull_requests.updated_at AS pr_updated_at
         FROM sessions
         INNER JOIN projects ON projects.id = sessions.project_id
         LEFT JOIN workspaces ON workspaces.id = sessions.workspace_id
         LEFT JOIN workspace_pull_requests
           ON workspace_pull_requests.workspace_id = sessions.workspace_id
         WHERE sessions.id = ?`,
      )
      .get(sessionId) as
      | {
          id: string
          working_directory: string
          project_name: string | null
          workspace_path: string | null
          workspace_branch_name: string | null
          pr_id: string | null
          pr_project_id: string | null
          pr_workspace_id: string | null
          pr_provider: string | null
          pr_lookup_status: string | null
          pr_state: string | null
          pr_repository_owner: string | null
          pr_repository_name: string | null
          pr_number: number | null
          pr_title: string | null
          pr_url: string | null
          pr_is_draft: number | null
          pr_head_branch: string | null
          pr_base_branch: string | null
          pr_merged_at: string | null
          pr_last_checked_at: string | null
          pr_error: string | null
          pr_created_at: string | null
          pr_updated_at: string | null
        }
      | undefined

    if (!row) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    return {
      id: row.id,
      projectName: row.project_name,
      workspacePath: row.workspace_path,
      workspaceBranchName: row.workspace_branch_name,
      workingDirectory: row.working_directory,
      pullRequest:
        row.pr_id === null
          ? null
          : workspacePullRequestFromRow({
              id: row.pr_id,
              project_id: row.pr_project_id ?? '',
              workspace_id: row.pr_workspace_id ?? '',
              provider: row.pr_provider ?? 'unknown',
              lookup_status: row.pr_lookup_status ?? 'error',
              state: row.pr_state ?? 'unknown',
              repository_owner: row.pr_repository_owner,
              repository_name: row.pr_repository_name,
              number: row.pr_number,
              title: row.pr_title,
              url: row.pr_url,
              is_draft: row.pr_is_draft ?? 0,
              head_branch: row.pr_head_branch,
              base_branch: row.pr_base_branch,
              merged_at: row.pr_merged_at,
              last_checked_at: row.pr_last_checked_at ?? '',
              error: row.pr_error,
              created_at: row.pr_created_at ?? '',
              updated_at: row.pr_updated_at ?? '',
            }),
    }
  }
}
