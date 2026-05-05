import { describe, expect, it } from 'vitest'
import type { ReviewNote } from '@/entities/review-note'
import { parseUnifiedDiff } from './diff-lines.pure'
import {
  countDraftReviewNotes,
  countReviewNotesByState,
  countReviewNotesByFile,
  filterReviewNotes,
  findReviewNoteDiffLineIds,
  groupReviewNotesByFile,
  isFileLevelReviewNote,
} from './review-notes.pure'

describe('review-notes pure helpers', () => {
  it('groups notes by first-seen file path in stable order', () => {
    const notes = [
      makeNote({ id: 'a', filePath: 'src/a.ts', body: 'first' }),
      makeNote({ id: 'b', filePath: 'src/b.ts', body: 'second' }),
      makeNote({ id: 'c', filePath: 'src/a.ts', body: 'third' }),
    ]

    expect(groupReviewNotesByFile(notes)).toEqual([
      { filePath: 'src/a.ts', notes: [notes[0], notes[2]] },
      { filePath: 'src/b.ts', notes: [notes[1]] },
    ])
  })

  it('counts draft notes and file badges independently', () => {
    const notes = [
      makeNote({ id: 'a', filePath: 'src/a.ts', state: 'draft' }),
      makeNote({ id: 'b', filePath: 'src/a.ts', state: 'sent' }),
      makeNote({ id: 'c', filePath: 'src/b.ts', state: 'resolved' }),
    ]

    expect(countDraftReviewNotes(notes)).toBe(1)
    expect(countReviewNotesByState(notes)).toEqual({
      all: 3,
      draft: 1,
      sent: 1,
      resolved: 1,
    })
    expect(countReviewNotesByFile(notes)).toEqual({
      'src/a.ts': 2,
      'src/b.ts': 1,
    })
  })

  it('filters notes by lifecycle state', () => {
    const draft = makeNote({ id: 'draft', state: 'draft' })
    const sent = makeNote({ id: 'sent', state: 'sent' })
    const resolved = makeNote({ id: 'resolved', state: 'resolved' })
    const notes = [draft, sent, resolved]

    expect(filterReviewNotes(notes, 'all')).toEqual(notes)
    expect(filterReviewNotes(notes, 'draft')).toEqual([draft])
    expect(filterReviewNotes(notes, 'sent')).toEqual([sent])
    expect(filterReviewNotes(notes, 'resolved')).toEqual([resolved])
  })

  it('detects file-level notes without line ranges', () => {
    expect(
      isFileLevelReviewNote(
        makeNote({
          oldStartLine: null,
          oldEndLine: null,
          newStartLine: null,
          newEndLine: null,
        }),
      ),
    ).toBe(true)
    expect(isFileLevelReviewNote(makeNote({ newStartLine: 8 }))).toBe(false)
  })

  it('finds diff rows covered by a mixed old/new note range', () => {
    const lines = parseUnifiedDiff(
      '@@ -4,3 +4,4 @@\n context\n-old\n+new\n+extra\n tail',
    )

    const ids = findReviewNoteDiffLineIds({
      lines,
      note: makeNote({
        oldStartLine: 5,
        oldEndLine: 5,
        newStartLine: 5,
        newEndLine: 6,
        hunkHeader: '@@ -4,3 +4,4 @@',
      }),
    })

    expect(ids).toEqual(['diff-line-2', 'diff-line-3', 'diff-line-4'])
  })

  it('returns no anchor ids for stale line ranges', () => {
    const lines = parseUnifiedDiff('@@ -1 +1 @@\n-old\n+new')

    expect(
      findReviewNoteDiffLineIds({
        lines,
        note: makeNote({
          oldStartLine: 20,
          oldEndLine: 21,
          newStartLine: null,
          newEndLine: null,
        }),
      }),
    ).toEqual([])
  })
})

function makeNote(patch: Partial<ReviewNote>): ReviewNote {
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
    selectedDiff: '+line',
    body: 'Question',
    state: 'draft',
    sentAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}
