export type TurnStatus = 'running' | 'completed' | 'errored'

export type TurnFileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed'

export interface Turn {
  id: string
  sessionId: string
  sequence: number
  startedAt: string
  endedAt: string | null
  status: TurnStatus
  summary: string | null
}

export interface TurnFileChange {
  id: string
  sessionId: string
  turnId: string
  filePath: string
  oldPath: string | null
  status: TurnFileChangeStatus
  additions: number
  deletions: number
  diff: string
  createdAt: string
}

export interface TurnInsertRow {
  id: string
  sessionId: string
  sequence: number
  startedAt: string
  endedAt: string | null
  status: TurnStatus
  summary: string | null
}

export interface TurnFileChangeInsertRow {
  id: string
  sessionId: string
  turnId: string
  filePath: string
  oldPath: string | null
  status: TurnFileChangeStatus
  additions: number
  deletions: number
  diff: string
  createdAt: string
}

export const TURN_DIFF_MAX_BYTES = 200 * 1024
export const TURN_SUMMARY_MAX_CHARS = 80
export const TURN_DIFF_TRUNCATION_MARKER_PREFIX = '[diff truncated:'
export const TURN_BINARY_DIFF_MARKER = '[binary file change]'
