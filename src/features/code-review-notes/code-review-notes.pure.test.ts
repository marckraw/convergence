import { describe, expect, it } from 'vitest'
import type { ReviewNote } from '@/entities/review-note'
import {
  buildFileLevelReviewNoteDiff,
  buildStoredReviewNoteDiff,
  countDraftReviewNotes,
  countReviewNotesByFile,
  countReviewNotesByState,
  filterReviewNotes,
  findReviewNoteDiffLineIds,
  formatReviewNoteFilterLabel,
  formatReviewNoteLocation,
  formatSelectionSummary,
  getReviewNoteAnnotationElementId,
  groupReviewNotesByFile,
  isFileLevelReviewNote,
  mapReviewNotesToDiffAnnotations,
} from './code-review-notes.pure'

describe('code-review-notes helpers', () => {
  it('groups, counts, and filters review notes', () => {
    const draft = makeNote({ id: 'draft', filePath: 'a.ts', state: 'draft' })
    const sent = makeNote({ id: 'sent', filePath: 'a.ts', state: 'sent' })
    const resolved = makeNote({
      id: 'resolved',
      filePath: 'b.ts',
      state: 'resolved',
    })
    const notes = [draft, sent, resolved]

    expect(groupReviewNotesByFile(notes)).toEqual([
      { filePath: 'a.ts', notes: [draft, sent] },
      { filePath: 'b.ts', notes: [resolved] },
    ])
    expect(countDraftReviewNotes(notes)).toBe(1)
    expect(countReviewNotesByState(notes)).toEqual({
      all: 3,
      draft: 1,
      sent: 1,
      resolved: 1,
    })
    expect(countReviewNotesByFile(notes)).toEqual({ 'a.ts': 2, 'b.ts': 1 })
    expect(filterReviewNotes(notes, 'sent')).toEqual([sent])
    expect(filterReviewNotes(notes, 'all')).toEqual(notes)
  })

  it('formats labels, locations, and stored diff fallbacks', () => {
    expect(getReviewNoteAnnotationElementId('note-1')).toBe(
      'review-note-annotation-note-1',
    )
    expect(formatReviewNoteFilterLabel('draft', 2)).toBe('Draft 2')
    expect(
      formatSelectionSummary({
        oldStartLine: 2,
        oldEndLine: 4,
        newStartLine: 8,
        newEndLine: 8,
      }),
    ).toBe('Old 2-4 · New 8')
    expect(buildFileLevelReviewNoteDiff('src/app.ts')).toContain('src/app.ts')
    expect(
      buildStoredReviewNoteDiff(
        makeNote({
          hunkHeader: '@@ -1 +1 @@',
          selectedDiff: '+new',
        }),
      ),
    ).toBe('@@ -1 +1 @@\n+new')
    expect(
      formatReviewNoteLocation(
        makeNote({ newStartLine: 10, newEndLine: null }),
      ),
    ).toBe('10')
    expect(
      formatReviewNoteLocation(
        makeNote({
          oldStartLine: 2,
          oldEndLine: null,
          newStartLine: null,
          newEndLine: null,
        }),
      ),
    ).toBe('2')
    expect(formatReviewNoteLocation(makeFileNote())).toBe('file')
  })

  it('maps line notes to current diff annotations and stale notes', () => {
    const note = makeNote({
      id: 'note-1',
      filePath: 'src/app.ts',
      newStartLine: 1,
      newEndLine: 1,
      hunkHeader: '@@ -1 +1 @@',
    })
    const stale = makeNote({
      id: 'stale',
      filePath: 'src/app.ts',
      newStartLine: 20,
      newEndLine: 20,
    })
    const lines = [
      {
        id: 'line-1',
        oldLine: null,
        newLine: null,
        hunkHeader: '@@ -1 +1 @@',
      },
      {
        id: 'line-2',
        oldLine: null,
        newLine: 1,
        hunkHeader: '@@ -1 +1 @@',
      },
    ]

    expect(findReviewNoteDiffLineIds({ note, lines })).toEqual(['line-2'])
    expect(
      mapReviewNotesToDiffAnnotations({
        notes: [note, stale, makeFileNote()],
        lines,
        filePath: 'src/app.ts',
        mode: 'working-tree',
        activeNoteId: 'note-1',
      }),
    ).toEqual({
      annotations: [
        {
          side: 'additions',
          lineNumber: 1,
          metadata: {
            note,
            lineIds: ['line-2'],
            active: true,
          },
        },
      ],
      staleNoteIds: ['stale'],
    })
  })

  it('detects file-level notes', () => {
    expect(isFileLevelReviewNote(makeFileNote())).toBe(true)
    expect(isFileLevelReviewNote(makeNote({ newStartLine: 8 }))).toBe(false)
  })
})

function makeFileNote(): ReviewNote {
  return makeNote({
    oldStartLine: null,
    oldEndLine: null,
    newStartLine: null,
    newEndLine: null,
  })
}

function makeNote(patch: Partial<ReviewNote>): ReviewNote {
  return {
    id: 'note',
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    filePath: 'src/app.ts',
    mode: 'working-tree',
    oldStartLine: null,
    oldEndLine: null,
    newStartLine: 1,
    newEndLine: 1,
    hunkHeader: null,
    selectedDiff: '+new',
    body: 'Explain this',
    state: 'draft',
    sentAt: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...patch,
  }
}
