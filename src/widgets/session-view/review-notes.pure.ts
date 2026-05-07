import type { DiffLineAnnotation } from '@pierre/diffs'
import type { ReviewNote } from '@/entities/review-note'
import type { DiffLine } from './diff-lines.pure'

export type ReviewNoteFilter = 'all' | ReviewNote['state']

export interface ReviewNoteGroup {
  filePath: string
  notes: ReviewNote[]
}

export interface ReviewNoteDiffAnnotationMetadata {
  note: ReviewNote
  lineIds: string[]
  active: boolean
}

export type ReviewNoteDiffAnnotation =
  DiffLineAnnotation<ReviewNoteDiffAnnotationMetadata>

export interface ReviewNoteDiffAnnotationMapping {
  annotations: ReviewNoteDiffAnnotation[]
  staleNoteIds: string[]
}

export function getReviewNoteAnnotationElementId(noteId: string): string {
  return `review-note-annotation-${noteId}`
}

export function filterReviewNotes(
  notes: ReviewNote[],
  filter: ReviewNoteFilter,
): ReviewNote[] {
  if (filter === 'all') return notes
  return notes.filter((note) => note.state === filter)
}

export function groupReviewNotesByFile(notes: ReviewNote[]): ReviewNoteGroup[] {
  const groups = new Map<string, ReviewNote[]>()

  for (const note of notes) {
    groups.set(note.filePath, [...(groups.get(note.filePath) ?? []), note])
  }

  return [...groups.entries()].map(([filePath, groupedNotes]) => ({
    filePath,
    notes: groupedNotes,
  }))
}

export function countDraftReviewNotes(notes: ReviewNote[]): number {
  return notes.filter((note) => note.state === 'draft').length
}

export function countReviewNotesByState(
  notes: ReviewNote[],
): Record<ReviewNoteFilter, number> {
  return notes.reduce<Record<ReviewNoteFilter, number>>(
    (counts, note) => {
      counts.all += 1
      counts[note.state] += 1
      return counts
    },
    {
      all: 0,
      draft: 0,
      sent: 0,
      resolved: 0,
    },
  )
}

export function countReviewNotesByFile(
  notes: ReviewNote[],
): Record<string, number> {
  return notes.reduce<Record<string, number>>((counts, note) => {
    counts[note.filePath] = (counts[note.filePath] ?? 0) + 1
    return counts
  }, {})
}

export function findReviewNoteDiffLineIds(input: {
  note: ReviewNote
  lines: DiffLine[]
}): string[] {
  const oldStart = input.note.oldStartLine
  const oldEnd = input.note.oldEndLine ?? input.note.oldStartLine
  const newStart = input.note.newStartLine
  const newEnd = input.note.newEndLine ?? input.note.newStartLine

  return input.lines
    .filter((line) => {
      if (
        input.note.hunkHeader &&
        line.hunkHeader &&
        line.hunkHeader !== input.note.hunkHeader
      ) {
        return false
      }

      return (
        isLineInRange(line.oldLine, oldStart, oldEnd) ||
        isLineInRange(line.newLine, newStart, newEnd)
      )
    })
    .map((line) => line.id)
}

export function mapReviewNotesToDiffAnnotations(input: {
  notes: ReviewNote[]
  lines: DiffLine[]
  filePath: string | null
  mode: ReviewNote['mode']
  activeNoteId: string | null
}): ReviewNoteDiffAnnotationMapping {
  if (!input.filePath) {
    return { annotations: [], staleNoteIds: [] }
  }

  const annotations: ReviewNoteDiffAnnotation[] = []
  const staleNoteIds: string[] = []

  for (const note of input.notes) {
    if (note.filePath !== input.filePath || note.mode !== input.mode) continue
    if (isFileLevelReviewNote(note)) continue

    const lineIds = findReviewNoteDiffLineIds({ note, lines: input.lines })
    const anchorLine = findReviewNoteAnnotationAnchor({
      note,
      lines: input.lines,
    })

    if (!anchorLine || lineIds.length === 0) {
      staleNoteIds.push(note.id)
      continue
    }

    annotations.push({
      side: anchorLine.side,
      lineNumber: anchorLine.lineNumber,
      metadata: {
        note,
        lineIds,
        active: note.id === input.activeNoteId,
      },
    })
  }

  return { annotations, staleNoteIds }
}

export function isFileLevelReviewNote(note: ReviewNote): boolean {
  return (
    note.oldStartLine === null &&
    note.oldEndLine === null &&
    note.newStartLine === null &&
    note.newEndLine === null
  )
}

function findReviewNoteAnnotationAnchor(input: {
  note: ReviewNote
  lines: DiffLine[]
}): { side: ReviewNoteDiffAnnotation['side']; lineNumber: number } | null {
  const oldEnd = input.note.oldEndLine ?? input.note.oldStartLine
  const newEnd = input.note.newEndLine ?? input.note.newStartLine

  if (input.note.newStartLine !== null && newEnd !== null) {
    const additionLine = input.lines.find(
      (line) =>
        isLineInRange(line.newLine, input.note.newStartLine, newEnd) &&
        isMatchingHunk(line, input.note.hunkHeader),
    )
    if (additionLine?.newLine !== null && additionLine?.newLine !== undefined) {
      return { side: 'additions', lineNumber: additionLine.newLine }
    }
  }

  if (input.note.oldStartLine !== null && oldEnd !== null) {
    const deletionLine = input.lines.find(
      (line) =>
        isLineInRange(line.oldLine, input.note.oldStartLine, oldEnd) &&
        isMatchingHunk(line, input.note.hunkHeader),
    )
    if (deletionLine?.oldLine !== null && deletionLine?.oldLine !== undefined) {
      return { side: 'deletions', lineNumber: deletionLine.oldLine }
    }
  }

  return null
}

function isMatchingHunk(line: DiffLine, hunkHeader: string | null): boolean {
  return !hunkHeader || !line.hunkHeader || line.hunkHeader === hunkHeader
}

function isLineInRange(
  line: number | null,
  start: number | null,
  end: number | null,
): boolean {
  if (line === null || start === null || end === null) return false
  return line >= start && line <= end
}
