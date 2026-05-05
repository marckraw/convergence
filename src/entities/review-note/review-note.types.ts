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
