import type { ReviewNote } from '@/entities/review-note'
import type { DiffLine } from './diff-lines.pure'

export type ReviewNoteFilter = 'all' | ReviewNote['state']

export interface ReviewNoteGroup {
  filePath: string
  notes: ReviewNote[]
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

export function isFileLevelReviewNote(note: ReviewNote): boolean {
  return (
    note.oldStartLine === null &&
    note.oldEndLine === null &&
    note.newStartLine === null &&
    note.newEndLine === null
  )
}

function isLineInRange(
  line: number | null,
  start: number | null,
  end: number | null,
): boolean {
  if (line === null || start === null || end === null) return false
  return line >= start && line <= end
}
