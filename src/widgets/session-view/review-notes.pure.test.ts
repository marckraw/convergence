import { describe, expect, it } from 'vitest'
import type { ReviewNote } from '@/entities/review-note'
import { parseUnifiedDiffForReviewAnchors } from './diff-lines.pure'
import {
  countDraftReviewNotes,
  countReviewNotesByState,
  countReviewNotesByFile,
  filterReviewNotes,
  findReviewNoteDiffLineIds,
  getReviewNoteAnnotationElementId,
  groupReviewNotesByFile,
  isFileLevelReviewNote,
  mapReviewNotesToDiffAnnotations,
} from './review-notes.pure'

describe('review-notes pure helpers', () => {
  it('builds stable DOM ids for diff annotations', () => {
    expect(getReviewNoteAnnotationElementId('note-123')).toBe(
      'review-note-annotation-note-123',
    )
  })

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
    const lines = parseUnifiedDiffForReviewAnchors(
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
    const lines = parseUnifiedDiffForReviewAnchors('@@ -1 +1 @@\n-old\n+new')

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

  it('maps current-file review notes to Pierre diff annotations', () => {
    const lines = parseUnifiedDiffForReviewAnchors(
      '@@ -4,3 +4,4 @@\n context\n-old\n+new\n+extra\n tail',
    )
    const note = makeNote({
      id: 'note-current',
      oldStartLine: 5,
      oldEndLine: 5,
      newStartLine: 5,
      newEndLine: 6,
      hunkHeader: '@@ -4,3 +4,4 @@',
    })

    expect(
      mapReviewNotesToDiffAnnotations({
        notes: [
          note,
          makeNote({ id: 'other-file', filePath: 'src/other.ts' }),
          makeNote({ id: 'file-level', newStartLine: null, newEndLine: null }),
        ],
        lines,
        filePath: 'src/app.ts',
        mode: 'working-tree',
        activeNoteId: 'note-current',
      }),
    ).toEqual({
      annotations: [
        {
          side: 'additions',
          lineNumber: 5,
          metadata: {
            note,
            lineIds: ['diff-line-2', 'diff-line-3', 'diff-line-4'],
            active: true,
          },
        },
      ],
      staleNoteIds: [],
    })
  })

  it('maps deletion-only notes to deletion annotations', () => {
    const lines = parseUnifiedDiffForReviewAnchors(
      '@@ -1,2 +1 @@\n-old\n context',
    )
    const note = makeNote({
      oldStartLine: 1,
      oldEndLine: 1,
      newStartLine: null,
      newEndLine: null,
      hunkHeader: '@@ -1,2 +1 @@',
    })

    expect(
      mapReviewNotesToDiffAnnotations({
        notes: [note],
        lines,
        filePath: 'src/app.ts',
        mode: 'working-tree',
        activeNoteId: null,
      }).annotations,
    ).toEqual([
      {
        side: 'deletions',
        lineNumber: 1,
        metadata: {
          note,
          lineIds: ['diff-line-1'],
          active: false,
        },
      },
    ])
  })

  it('reports stale current-file note anchors without dropping tray notes', () => {
    const lines = parseUnifiedDiffForReviewAnchors('@@ -1 +1 @@\n-old\n+new')

    expect(
      mapReviewNotesToDiffAnnotations({
        notes: [
          makeNote({ id: 'stale', newStartLine: 20, newEndLine: 20 }),
          makeNote({ id: 'other-mode', mode: 'base-branch', newStartLine: 20 }),
        ],
        lines,
        filePath: 'src/app.ts',
        mode: 'working-tree',
        activeNoteId: null,
      }),
    ).toMatchObject({
      annotations: [],
      staleNoteIds: ['stale'],
    })
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
