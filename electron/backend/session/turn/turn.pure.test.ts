import { describe, expect, it } from 'vitest'
import {
  SessionTurnFileChangeRow,
  SessionTurnRow,
} from '../../database/database.types'
import {
  countAdditionsAndDeletions,
  deriveTurnSummary,
  isBinaryDiff,
  isTruncatedDiff,
  parseRenameFromDiff,
  truncateDiffIfTooLarge,
  turnFileChangeFromRow,
  turnFileChangeToInsertRow,
  turnFromRow,
  turnToInsertRow,
} from './turn.pure'
import {
  TURN_BINARY_DIFF_MARKER,
  TURN_DIFF_MAX_BYTES,
  TURN_SUMMARY_MAX_CHARS,
  type Turn,
  type TurnFileChange,
} from './turn.types'

describe('deriveTurnSummary', () => {
  it('returns null for null input', () => {
    expect(deriveTurnSummary(null)).toBeNull()
  })

  it('returns null for whitespace-only input', () => {
    expect(deriveTurnSummary('   \n\t  ')).toBeNull()
  })

  it('collapses internal whitespace and trims', () => {
    expect(deriveTurnSummary('  Hello\n\tworld  ')).toBe('Hello world')
  })

  it('passes short messages through unchanged after collapsing', () => {
    const msg = 'Fix bug in auth flow'
    expect(deriveTurnSummary(msg)).toBe(msg)
  })

  it('truncates at the max length with an ellipsis', () => {
    const msg = 'a'.repeat(100)
    const result = deriveTurnSummary(msg)
    expect(result).toBeTypeOf('string')
    expect(result!.length).toBe(TURN_SUMMARY_MAX_CHARS)
    expect(result!.endsWith('…')).toBe(true)
  })

  it('does not truncate a message exactly at the limit', () => {
    const msg = 'a'.repeat(TURN_SUMMARY_MAX_CHARS)
    expect(deriveTurnSummary(msg)).toBe(msg)
  })
})

describe('countAdditionsAndDeletions', () => {
  it('counts added and deleted lines, ignoring file header markers', () => {
    const diff = [
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,4 @@',
      ' unchanged',
      '+added one',
      '+added two',
      '-removed one',
      ' unchanged',
    ].join('\n')
    expect(countAdditionsAndDeletions(diff)).toEqual({
      additions: 2,
      deletions: 1,
    })
  })

  it('returns zeros for an empty diff', () => {
    expect(countAdditionsAndDeletions('')).toEqual({
      additions: 0,
      deletions: 0,
    })
  })

  it('does not confuse file header lines with content', () => {
    const diff = ['--- a/x', '+++ b/x'].join('\n')
    expect(countAdditionsAndDeletions(diff)).toEqual({
      additions: 0,
      deletions: 0,
    })
  })
})

describe('isBinaryDiff', () => {
  it('detects the sentinel marker', () => {
    expect(isBinaryDiff(TURN_BINARY_DIFF_MARKER)).toBe(true)
  })

  it('detects a git "Binary files ... differ" line', () => {
    const diff = [
      'diff --git a/logo.png b/logo.png',
      'Binary files a/logo.png and b/logo.png differ',
    ].join('\n')
    expect(isBinaryDiff(diff)).toBe(true)
  })

  it('returns false for a textual diff', () => {
    const diff = ['--- a/file.ts', '+++ b/file.ts', '@@ -1 +1 @@'].join('\n')
    expect(isBinaryDiff(diff)).toBe(false)
  })
})

describe('parseRenameFromDiff', () => {
  it('extracts old and new paths from a rename diff', () => {
    const diff = [
      'diff --git a/old.ts b/new.ts',
      'similarity index 95%',
      'rename from old.ts',
      'rename to new.ts',
    ].join('\n')
    expect(parseRenameFromDiff(diff)).toEqual({
      oldPath: 'old.ts',
      newPath: 'new.ts',
    })
  })

  it('returns null when either marker is missing', () => {
    const missingFrom = ['rename to new.ts'].join('\n')
    const missingTo = ['rename from old.ts'].join('\n')
    expect(parseRenameFromDiff(missingFrom)).toBeNull()
    expect(parseRenameFromDiff(missingTo)).toBeNull()
    expect(parseRenameFromDiff('')).toBeNull()
  })
})

describe('truncateDiffIfTooLarge', () => {
  it('returns the diff unchanged when within the limit', () => {
    const diff = 'small diff\n'
    expect(truncateDiffIfTooLarge(diff, 100)).toEqual({
      diff,
      truncated: false,
    })
  })

  it('replaces the diff with a truncation marker when over the limit', () => {
    const diff = Array.from({ length: 50 }, () => 'x'.repeat(100)).join('\n')
    const result = truncateDiffIfTooLarge(diff, 200)
    expect(result.truncated).toBe(true)
    expect(result.diff).toMatch(/^\[diff truncated: \d+ lines\]$/)
  })

  it('treats a diff exactly at the byte limit as not truncated', () => {
    const body = 'x'.repeat(100)
    expect(Buffer.byteLength(body, 'utf8')).toBe(100)
    expect(truncateDiffIfTooLarge(body, 100)).toEqual({
      diff: body,
      truncated: false,
    })
  })

  it('uses the configured default max when none is passed', () => {
    const body = 'x'.repeat(TURN_DIFF_MAX_BYTES - 1)
    const result = truncateDiffIfTooLarge(body)
    expect(result.truncated).toBe(false)
  })

  it('isTruncatedDiff recognizes the marker', () => {
    const marker = '[diff truncated: 42 lines]'
    expect(isTruncatedDiff(marker)).toBe(true)
    expect(isTruncatedDiff('--- a\n+++ b\n')).toBe(false)
  })
})

describe('row conversions', () => {
  const now = '2026-04-23T10:00:00.000Z'

  const turnRow: SessionTurnRow = {
    id: 'turn-1',
    session_id: 'session-1',
    sequence: 3,
    started_at: now,
    ended_at: null,
    status: 'running',
    summary: null,
  }

  const changeRow: SessionTurnFileChangeRow = {
    id: 'change-1',
    session_id: 'session-1',
    turn_id: 'turn-1',
    file_path: 'src/a.ts',
    old_path: null,
    status: 'modified',
    additions: 3,
    deletions: 1,
    diff: '--- a/src/a.ts\n+++ b/src/a.ts\n',
    created_at: now,
  }

  it('turnFromRow maps snake_case to camelCase and parses status', () => {
    expect(turnFromRow(turnRow)).toEqual<Turn>({
      id: 'turn-1',
      sessionId: 'session-1',
      sequence: 3,
      startedAt: now,
      endedAt: null,
      status: 'running',
      summary: null,
    })
  })

  it('turnFromRow throws on unknown status', () => {
    expect(() => turnFromRow({ ...turnRow, status: 'mystery' })).toThrow(
      /Unknown turn status/,
    )
  })

  it('turnFileChangeFromRow maps snake_case to camelCase', () => {
    expect(turnFileChangeFromRow(changeRow)).toEqual<TurnFileChange>({
      id: 'change-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      filePath: 'src/a.ts',
      oldPath: null,
      status: 'modified',
      additions: 3,
      deletions: 1,
      diff: '--- a/src/a.ts\n+++ b/src/a.ts\n',
      createdAt: now,
    })
  })

  it('turnFileChangeFromRow throws on unknown status', () => {
    expect(() =>
      turnFileChangeFromRow({ ...changeRow, status: 'mystery' }),
    ).toThrow(/Unknown turn file change status/)
  })

  it('turnToInsertRow is a pure projection of the domain shape', () => {
    const turn: Turn = {
      id: 'turn-2',
      sessionId: 'session-1',
      sequence: 4,
      startedAt: now,
      endedAt: now,
      status: 'completed',
      summary: 'Fixed login',
    }
    expect(turnToInsertRow(turn)).toEqual(turn)
  })

  it('turnFileChangeToInsertRow is a pure projection of the domain shape', () => {
    const change: TurnFileChange = {
      id: 'change-2',
      sessionId: 'session-1',
      turnId: 'turn-1',
      filePath: 'src/a.ts',
      oldPath: 'src/old.ts',
      status: 'renamed',
      additions: 0,
      deletions: 0,
      diff: 'rename from src/old.ts\nrename to src/a.ts\n',
      createdAt: now,
    }
    expect(turnFileChangeToInsertRow(change)).toEqual(change)
  })
})
