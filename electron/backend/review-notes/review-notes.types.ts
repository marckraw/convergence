import type { ReviewNoteRow } from '../database/database.types'

export type ReviewNoteMode = 'working-tree' | 'base-branch'
export type ReviewNoteState = 'draft' | 'sent' | 'resolved'

export interface ReviewNote {
  id: string
  sessionId: string
  workspaceId: string | null
  filePath: string
  mode: ReviewNoteMode
  oldStartLine: number | null
  oldEndLine: number | null
  newStartLine: number | null
  newEndLine: number | null
  hunkHeader: string | null
  selectedDiff: string
  body: string
  state: ReviewNoteState
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateReviewNoteInput {
  sessionId: string
  workspaceId?: string | null
  filePath: string
  mode: ReviewNoteMode
  oldStartLine?: number | null
  oldEndLine?: number | null
  newStartLine?: number | null
  newEndLine?: number | null
  hunkHeader?: string | null
  selectedDiff: string
  body: string
}

export interface UpdateReviewNoteInput {
  body?: string
  state?: ReviewNoteState
}

export interface PreviewReviewNotePacketInput {
  sessionId: string
  noteIds?: string[]
}

export interface ReviewNotePacketSessionContext {
  sessionId: string
  projectName: string | null
  workspacePath: string | null
  workspaceBranchName: string | null
  workingDirectory: string
}

export interface ReviewNotePacketPullRequestContext {
  repositoryOwner: string | null
  repositoryName: string | null
  number: number | null
  title: string | null
  url: string | null
  state: string | null
  baseBranch: string | null
  headBranch: string | null
}

export interface ReviewNotePacketPreview {
  noteCount: number
  text: string
}

export function reviewNoteFromRow(row: ReviewNoteRow): ReviewNote {
  return {
    id: row.id,
    sessionId: row.session_id,
    workspaceId: row.workspace_id,
    filePath: row.file_path,
    mode: parseReviewNoteMode(row.mode),
    oldStartLine: row.old_start_line,
    oldEndLine: row.old_end_line,
    newStartLine: row.new_start_line,
    newEndLine: row.new_end_line,
    hunkHeader: row.hunk_header,
    selectedDiff: row.selected_diff,
    body: row.body,
    state: parseReviewNoteState(row.state),
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function parseReviewNoteMode(value: string): ReviewNoteMode {
  if (value === 'working-tree' || value === 'base-branch') return value
  throw new Error(`Invalid review note mode: ${value}`)
}

export function parseReviewNoteState(value: string): ReviewNoteState {
  if (value === 'draft' || value === 'sent' || value === 'resolved') {
    return value
  }
  throw new Error(`Invalid review note state: ${value}`)
}
