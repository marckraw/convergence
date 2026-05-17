import type { DiffLineAnnotation } from '@pierre/diffs'
import type { ReviewNote } from '@/entities/review-note'

export interface CodeReviewDiffLine {
  oldLine: number | null
  newLine: number | null
  hunkHeader: string | null
  id: string
}

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
  lines: CodeReviewDiffLine[]
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
  lines: CodeReviewDiffLine[]
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

export function buildFileLevelReviewNoteDiff(filePath: string): string {
  return `(file-level note for ${filePath}; no specific diff lines selected)`
}

export function buildStoredReviewNoteDiff(note: ReviewNote): string {
  const selectedDiff = note.selectedDiff.trimEnd()
  if (!note.hunkHeader) return selectedDiff

  const firstSelectedLine = selectedDiff.split('\n')[0]
  if (firstSelectedLine === note.hunkHeader) return selectedDiff

  return `${note.hunkHeader}\n${selectedDiff}`
}

export function formatReviewNoteFilterLabel(
  filter: ReviewNoteFilter,
  count: number,
): string {
  return `${capitalize(filter)} ${count}`
}

export function formatSelectionSummary(summary: {
  oldStartLine: number | null
  oldEndLine: number | null
  newStartLine: number | null
  newEndLine: number | null
}): string {
  const oldRange = formatLineRange(summary.oldStartLine, summary.oldEndLine)
  const newRange = formatLineRange(summary.newStartLine, summary.newEndLine)
  if (oldRange && newRange) return `Old ${oldRange} · New ${newRange}`
  if (oldRange) return `Old ${oldRange}`
  if (newRange) return `New ${newRange}`
  return 'Metadata lines'
}

export function formatReviewNoteLocation(note: ReviewNote): string {
  if (isFileLevelReviewNote(note)) return 'file'

  const newRange = formatLineRange(note.newStartLine, note.newEndLine)
  if (newRange) return newRange

  const oldRange = formatLineRange(note.oldStartLine, note.oldEndLine)
  if (oldRange) return oldRange

  return 'metadata'
}

function findReviewNoteAnnotationAnchor(input: {
  note: ReviewNote
  lines: CodeReviewDiffLine[]
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

function formatLineRange(start: number | null, end: number | null): string {
  if (start === null) return ''
  if (end === null || end === start) return String(start)
  return `${start}-${end}`
}

function isMatchingHunk(
  line: CodeReviewDiffLine,
  hunkHeader: string | null,
): boolean {
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
