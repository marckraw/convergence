import type {
  SessionTurnFileChangeRow,
  SessionTurnRow,
} from '../../database/database.types'
import {
  TURN_BINARY_DIFF_MARKER,
  TURN_DIFF_MAX_BYTES,
  TURN_DIFF_TRUNCATION_MARKER_PREFIX,
  TURN_SUMMARY_MAX_CHARS,
  type Turn,
  type TurnFileChange,
  type TurnFileChangeInsertRow,
  type TurnFileChangeStatus,
  type TurnInsertRow,
  type TurnStatus,
} from './turn.types'

export function deriveTurnSummary(
  firstAssistantMessage: string | null,
): string | null {
  if (firstAssistantMessage === null) return null
  const collapsed = firstAssistantMessage.replace(/\s+/g, ' ').trim()
  if (collapsed.length === 0) return null
  if (collapsed.length <= TURN_SUMMARY_MAX_CHARS) return collapsed
  return collapsed.slice(0, TURN_SUMMARY_MAX_CHARS - 1).trimEnd() + '…'
}

export function countAdditionsAndDeletions(unifiedDiff: string): {
  additions: number
  deletions: number
} {
  let additions = 0
  let deletions = 0
  const lines = unifiedDiff.split('\n')
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) additions++
    else if (line.startsWith('-')) deletions++
  }
  return { additions, deletions }
}

export function isBinaryDiff(unifiedDiff: string): boolean {
  if (unifiedDiff === TURN_BINARY_DIFF_MARKER) return true
  // Git prints: "Binary files a/foo and b/foo differ"
  return /^Binary files .* differ$/m.test(unifiedDiff)
}

export function parseRenameFromDiff(
  unifiedDiff: string,
): { oldPath: string; newPath: string } | null {
  const fromMatch = unifiedDiff.match(/^rename from (.+)$/m)
  const toMatch = unifiedDiff.match(/^rename to (.+)$/m)
  if (!fromMatch || !toMatch) return null
  return { oldPath: fromMatch[1], newPath: toMatch[1] }
}

export function truncateDiffIfTooLarge(
  diff: string,
  maxBytes: number = TURN_DIFF_MAX_BYTES,
): { diff: string; truncated: boolean } {
  const byteLength = Buffer.byteLength(diff, 'utf8')
  if (byteLength <= maxBytes) {
    return { diff, truncated: false }
  }
  const lineCount = diff.split('\n').length
  const marker = `${TURN_DIFF_TRUNCATION_MARKER_PREFIX} ${lineCount} lines]`
  return { diff: marker, truncated: true }
}

export function isTruncatedDiff(diff: string): boolean {
  return diff.startsWith(TURN_DIFF_TRUNCATION_MARKER_PREFIX)
}

function turnStatusFromValue(value: string): TurnStatus {
  switch (value) {
    case 'running':
    case 'completed':
    case 'errored':
      return value
    default:
      throw new Error(`Unknown turn status: ${value}`)
  }
}

function turnFileChangeStatusFromValue(value: string): TurnFileChangeStatus {
  switch (value) {
    case 'added':
    case 'modified':
    case 'deleted':
    case 'renamed':
      return value
    default:
      throw new Error(`Unknown turn file change status: ${value}`)
  }
}

export function turnFromRow(row: SessionTurnRow): Turn {
  return {
    id: row.id,
    sessionId: row.session_id,
    sequence: row.sequence,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: turnStatusFromValue(row.status),
    summary: row.summary,
  }
}

export function turnFileChangeFromRow(
  row: SessionTurnFileChangeRow,
): TurnFileChange {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    filePath: row.file_path,
    oldPath: row.old_path,
    status: turnFileChangeStatusFromValue(row.status),
    additions: row.additions,
    deletions: row.deletions,
    diff: row.diff,
    createdAt: row.created_at,
  }
}

export function turnToInsertRow(turn: Turn): TurnInsertRow {
  return {
    id: turn.id,
    sessionId: turn.sessionId,
    sequence: turn.sequence,
    startedAt: turn.startedAt,
    endedAt: turn.endedAt,
    status: turn.status,
    summary: turn.summary,
  }
}

export function turnFileChangeToInsertRow(
  change: TurnFileChange,
): TurnFileChangeInsertRow {
  return {
    id: change.id,
    sessionId: change.sessionId,
    turnId: change.turnId,
    filePath: change.filePath,
    oldPath: change.oldPath,
    status: change.status,
    additions: change.additions,
    deletions: change.deletions,
    diff: change.diff,
    createdAt: change.createdAt,
  }
}
