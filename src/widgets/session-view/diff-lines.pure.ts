export type DiffLineKind =
  | 'context'
  | 'add'
  | 'delete'
  | 'hunk'
  | 'file'
  | 'meta'

export interface DiffLine {
  id: string
  kind: DiffLineKind
  text: string
  oldLine: number | null
  newLine: number | null
  hunkHeader: string | null
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(?:.*)$/

// Compatibility bridge for persisted ReviewNote anchors. Pierre owns rendering
// and selection UI; this keeps old/new lines, hunk headers, and selected text.
export function parseUnifiedDiffForReviewAnchors(diff: string): DiffLine[] {
  if (!diff) return []

  const rows: DiffLine[] = []
  let oldLine: number | null = null
  let newLine: number | null = null
  let hunkHeader: string | null = null

  for (const [index, text] of diff.split('\n').entries()) {
    const hunkMatch = text.match(HUNK_HEADER_RE)
    if (hunkMatch) {
      oldLine = Number(hunkMatch[1])
      newLine = Number(hunkMatch[2])
      hunkHeader = text
      rows.push(makeLine(index, 'hunk', text, null, null, hunkHeader))
      continue
    }

    if (isFileHeader(text)) {
      rows.push(makeLine(index, 'file', text, null, null, hunkHeader))
      continue
    }

    if (isMetaLine(text)) {
      rows.push(makeLine(index, 'meta', text, null, null, hunkHeader))
      continue
    }

    if (oldLine !== null && newLine !== null && text.startsWith('+')) {
      rows.push(makeLine(index, 'add', text, null, newLine, hunkHeader))
      newLine += 1
      continue
    }

    if (oldLine !== null && newLine !== null && text.startsWith('-')) {
      rows.push(makeLine(index, 'delete', text, oldLine, null, hunkHeader))
      oldLine += 1
      continue
    }

    if (oldLine !== null && newLine !== null) {
      rows.push(makeLine(index, 'context', text, oldLine, newLine, hunkHeader))
      oldLine += 1
      newLine += 1
      continue
    }

    rows.push(makeLine(index, 'meta', text, null, null, hunkHeader))
  }

  return rows
}

export function summarizeSelectedDiffLines(input: {
  lines: DiffLine[]
  selectedIds: string[]
}): {
  count: number
  oldStartLine: number | null
  oldEndLine: number | null
  newStartLine: number | null
  newEndLine: number | null
} {
  const selected = new Set(input.selectedIds)
  const lines = input.lines.filter((line) => selected.has(line.id))
  const oldLines = lines
    .map((line) => line.oldLine)
    .filter((line): line is number => line !== null)
  const newLines = lines
    .map((line) => line.newLine)
    .filter((line): line is number => line !== null)
  const oldRange = summarizeLineRange(oldLines)
  const newRange = summarizeLineRange(newLines)

  return {
    count: lines.length,
    oldStartLine: oldRange.start,
    oldEndLine: oldRange.end,
    newStartLine: newRange.start,
    newEndLine: newRange.end,
  }
}

function summarizeLineRange(lines: number[]): {
  start: number | null
  end: number | null
} {
  if (lines.length === 0) return { start: null, end: null }
  return {
    start: Math.min(...lines),
    end: Math.max(...lines),
  }
}

function makeLine(
  index: number,
  kind: DiffLineKind,
  text: string,
  oldLine: number | null,
  newLine: number | null,
  hunkHeader: string | null,
): DiffLine {
  return {
    id: `diff-line-${index}`,
    kind,
    text,
    oldLine,
    newLine,
    hunkHeader,
  }
}

function isFileHeader(text: string): boolean {
  return (
    text.startsWith('diff --git ') ||
    text.startsWith('--- ') ||
    text.startsWith('+++ ')
  )
}

function isMetaLine(text: string): boolean {
  return (
    text.startsWith('index ') ||
    text.startsWith('new file mode ') ||
    text.startsWith('deleted file mode ') ||
    text.startsWith('similarity index ') ||
    text.startsWith('rename from ') ||
    text.startsWith('rename to ') ||
    text.startsWith('\\ No newline at end of file')
  )
}
