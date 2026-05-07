import type { SelectedLineRange, SelectionSide } from '@pierre/diffs'
import type { DiffLine } from './diff-lines.pure'

export function mapPierreSelectionToDiffLineIds(input: {
  lines: DiffLine[]
  range: SelectedLineRange | null
}): string[] {
  if (!input.range) return []

  const startIndex = findSelectableLineIndex({
    lines: input.lines,
    lineNumber: input.range.start,
    side: input.range.side ?? 'additions',
  })
  const endIndex = findSelectableLineIndex({
    lines: input.lines,
    lineNumber: input.range.end,
    side: input.range.endSide ?? input.range.side ?? 'additions',
  })

  if (startIndex < 0 || endIndex < 0) return []

  const start = Math.min(startIndex, endIndex)
  const end = Math.max(startIndex, endIndex)

  return input.lines.slice(start, end + 1).map((line) => line.id)
}

export function mapDiffLineIdsToPierreSelection(input: {
  lines: DiffLine[]
  selectedIds: string[]
}): SelectedLineRange | null {
  const selected = new Set(input.selectedIds)
  const selectedLines = input.lines.filter((line) => selected.has(line.id))
  const startLine = selectedLines.find(toPierreSelectionPoint)
  const endLine = selectedLines.findLast(toPierreSelectionPoint)

  if (!startLine || !endLine) return null

  const start = toPierreSelectionPoint(startLine)
  const end = toPierreSelectionPoint(endLine)
  if (!start || !end) return null

  return {
    start: start.lineNumber,
    side: start.side,
    end: end.lineNumber,
    endSide: end.side,
  }
}

function findSelectableLineIndex(input: {
  lines: DiffLine[]
  lineNumber: number
  side: SelectionSide
}): number {
  return input.lines.findIndex((line) => {
    if (input.side === 'additions') return line.newLine === input.lineNumber
    return line.oldLine === input.lineNumber
  })
}

function toPierreSelectionPoint(
  line: DiffLine,
): { lineNumber: number; side: SelectionSide } | null {
  if (line.kind === 'delete' && line.oldLine !== null) {
    return { lineNumber: line.oldLine, side: 'deletions' }
  }

  if (line.newLine !== null) {
    return { lineNumber: line.newLine, side: 'additions' }
  }

  if (line.oldLine !== null) {
    return { lineNumber: line.oldLine, side: 'deletions' }
  }

  return null
}
