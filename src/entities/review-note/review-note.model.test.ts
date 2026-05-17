import { describe, expect, it } from 'vitest'
import type { ReviewNote } from './review-note.types'
import { selectReviewNotesForSession } from './review-note.model'

describe('review note model selectors', () => {
  it('returns a stable empty array when no session notes are loaded', () => {
    const state = { notesBySessionId: {} }

    expect(selectReviewNotesForSession(state, null)).toBe(
      selectReviewNotesForSession(state, null),
    )
    expect(selectReviewNotesForSession(state, 'missing')).toBe(
      selectReviewNotesForSession(state, 'missing'),
    )
  })

  it('returns loaded notes for a session', () => {
    const notes = [makeReviewNote()]
    const state = { notesBySessionId: { 'session-1': notes } }

    expect(selectReviewNotesForSession(state, 'session-1')).toBe(notes)
  })
})

function makeReviewNote(patch: Partial<ReviewNote> = {}): ReviewNote {
  return {
    id: 'note-1',
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    filePath: 'src/app.ts',
    mode: 'working-tree',
    oldStartLine: null,
    oldEndLine: null,
    newStartLine: 1,
    newEndLine: 1,
    hunkHeader: '@@ -1 +1 @@',
    selectedDiff: '+new',
    body: 'Explain this',
    state: 'draft',
    sentAt: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...patch,
  }
}
