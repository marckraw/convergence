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

export function parseUnifiedDiff(diff: string): DiffLine[] {
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

export function selectDiffLineRange(input: {
  lines: DiffLine[]
  anchorId: string | null
  targetId: string
}): string[] {
  const targetIndex = input.lines.findIndex(
    (line) => line.id === input.targetId,
  )
  if (targetIndex < 0) return []

  const anchorIndex = input.anchorId
    ? input.lines.findIndex((line) => line.id === input.anchorId)
    : targetIndex
  const start = Math.min(
    anchorIndex < 0 ? targetIndex : anchorIndex,
    targetIndex,
  )
  const end = Math.max(anchorIndex < 0 ? targetIndex : anchorIndex, targetIndex)

  return input.lines.slice(start, end + 1).map((line) => line.id)
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

  return {
    count: lines.length,
    oldStartLine: oldLines[0] ?? null,
    oldEndLine: oldLines.at(-1) ?? null,
    newStartLine: newLines[0] ?? null,
    newEndLine: newLines.at(-1) ?? null,
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
