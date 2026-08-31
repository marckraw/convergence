export const DEFAULT_DIFF_CONTEXT_LINES = 3
export const DIFF_CONTEXT_EXPANSION_STEP = 20
export const MAX_DIFF_CONTEXT_LINES = 10_000

export interface DiffContextWindow {
  before: number
  after: number
}

export interface FoldedDiffContext {
  patch: string
  hiddenBefore: number
  hiddenAfter: number
  totalHidden: number
  canExpandBefore: boolean
  canExpandAfter: boolean
}

type HunkLineKind = 'context' | 'add' | 'delete' | 'meta'

interface AnnotatedHunkLine {
  text: string
  kind: HunkLineKind
  oldBefore: number
  newBefore: number
  consumesOld: boolean
  consumesNew: boolean
}

interface HunkFoldResult {
  lines: string[]
  hiddenBefore: number
  hiddenAfter: number
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

export function foldUnifiedDiffContext(
  patch: string,
  context: DiffContextWindow,
): FoldedDiffContext {
  if (!patch.includes('@@')) {
    return {
      patch,
      hiddenBefore: 0,
      hiddenAfter: 0,
      totalHidden: 0,
      canExpandBefore: false,
      canExpandAfter: false,
    }
  }

  const before = normalizeContextLineCount(context.before)
  const after = normalizeContextLineCount(context.after)
  const lines = patch.split('\n')
  const output: string[] = []
  let hiddenBefore = 0
  let hiddenAfter = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!isHunkHeader(line)) {
      output.push(line)
      continue
    }

    const body: string[] = []
    let bodyIndex = index + 1
    while (
      bodyIndex < lines.length &&
      !isHunkHeader(lines[bodyIndex]) &&
      !lines[bodyIndex].startsWith('diff --git ')
    ) {
      body.push(lines[bodyIndex])
      bodyIndex += 1
    }

    const folded = foldHunk(line, body, { before, after })
    output.push(...folded.lines)
    hiddenBefore += folded.hiddenBefore
    hiddenAfter += folded.hiddenAfter
    index = bodyIndex - 1
  }

  const totalHidden = hiddenBefore + hiddenAfter

  return {
    patch: output.join('\n'),
    hiddenBefore,
    hiddenAfter,
    totalHidden,
    canExpandBefore: hiddenBefore > 0,
    canExpandAfter: hiddenAfter > 0,
  }
}

function foldHunk(
  header: string,
  body: string[],
  context: DiffContextWindow,
): HunkFoldResult {
  const headerMatch = header.match(HUNK_HEADER_RE)
  if (!headerMatch) {
    return { lines: [header, ...body], hiddenBefore: 0, hiddenAfter: 0 }
  }

  const annotated = annotateHunkLines({
    body,
    oldStart: Number(headerMatch[1]),
    newStart: Number(headerMatch[3]),
  })
  const groups = findChangeGroups(annotated)
  if (groups.length === 0) {
    return { lines: [header, ...body], hiddenBefore: 0, hiddenAfter: 0 }
  }

  const visible = new Set<number>()
  for (const group of groups) {
    const range = getVisibleRangeAroundGroup(annotated, group, context)
    for (let index = range.start; index <= range.end; index += 1) {
      visible.add(index)
    }
  }

  if (visible.size === body.length) {
    return { lines: [header, ...body], hiddenBefore: 0, hiddenAfter: 0 }
  }

  const hiddenBefore = countHiddenContext({
    annotated,
    visible,
    direction: 'before',
  })
  const hiddenAfter = countHiddenContext({
    annotated,
    visible,
    direction: 'after',
  })

  return {
    lines: buildFoldedHunks({
      annotated,
      visible,
      hunkContext: headerMatch[5] ?? '',
    }),
    hiddenBefore,
    hiddenAfter,
  }
}

function annotateHunkLines(input: {
  body: string[]
  oldStart: number
  newStart: number
}): AnnotatedHunkLine[] {
  let oldCursor = input.oldStart
  let newCursor = input.newStart

  return input.body.map((text) => {
    const kind = classifyHunkLine(text)
    const line: AnnotatedHunkLine = {
      text,
      kind,
      oldBefore: oldCursor,
      newBefore: newCursor,
      consumesOld: kind === 'context' || kind === 'delete',
      consumesNew: kind === 'context' || kind === 'add',
    }

    if (line.consumesOld) oldCursor += 1
    if (line.consumesNew) newCursor += 1

    return line
  })
}

function classifyHunkLine(text: string): HunkLineKind {
  if (text.startsWith('\\ No newline at end of file')) return 'meta'
  if (text.startsWith('+')) return 'add'
  if (text.startsWith('-')) return 'delete'
  return 'context'
}

function findChangeGroups(
  lines: AnnotatedHunkLine[],
): Array<{ start: number; end: number }> {
  const groups: Array<{ start: number; end: number }> = []
  let index = 0

  while (index < lines.length) {
    if (lines[index].kind === 'context') {
      index += 1
      continue
    }

    const start = index
    while (index + 1 < lines.length && lines[index + 1].kind !== 'context') {
      index += 1
    }
    groups.push({ start, end: index })
    index += 1
  }

  return groups
}

function getVisibleRangeAroundGroup(
  lines: AnnotatedHunkLine[],
  group: { start: number; end: number },
  context: DiffContextWindow,
): { start: number; end: number } {
  return {
    start: moveOverContextLines(lines, group.start, -1, context.before),
    end: moveOverContextLines(lines, group.end, 1, context.after),
  }
}

function moveOverContextLines(
  lines: AnnotatedHunkLine[],
  start: number,
  step: -1 | 1,
  limit: number,
): number {
  let result = start
  let seenContext = 0
  let index = start + step

  while (
    index >= 0 &&
    index < lines.length &&
    (seenContext < limit || lines[index].kind !== 'context')
  ) {
    result = index
    if (lines[index].kind === 'context') seenContext += 1
    index += step
  }

  return result
}

function countHiddenContext(input: {
  annotated: AnnotatedHunkLine[]
  visible: Set<number>
  direction: 'before' | 'after'
}): number {
  let count = 0

  for (const [index, line] of input.annotated.entries()) {
    if (line.kind !== 'context' || input.visible.has(index)) continue

    const hasVisibleBefore = hasVisibleLine(input.visible, 0, index - 1)
    const hasVisibleAfter = hasVisibleLine(
      input.visible,
      index + 1,
      input.annotated.length - 1,
    )

    if (input.direction === 'before' && hasVisibleAfter) count += 1
    if (input.direction === 'after' && hasVisibleBefore) count += 1
  }

  return count
}

function hasVisibleLine(
  visible: Set<number>,
  start: number,
  end: number,
): boolean {
  for (let index = start; index <= end; index += 1) {
    if (visible.has(index)) return true
  }
  return false
}

function buildFoldedHunks(input: {
  annotated: AnnotatedHunkLine[]
  visible: Set<number>
  hunkContext: string
}): string[] {
  const output: string[] = []
  let index = 0

  while (index < input.annotated.length) {
    if (!input.visible.has(index)) {
      index += 1
      continue
    }

    const start = index
    while (index + 1 < input.annotated.length && input.visible.has(index + 1)) {
      index += 1
    }

    output.push(
      buildHunkHeader(
        input.annotated.slice(start, index + 1),
        input.hunkContext,
      ),
    )
    for (let lineIndex = start; lineIndex <= index; lineIndex += 1) {
      output.push(input.annotated[lineIndex].text)
    }

    index += 1
  }

  return output
}

function buildHunkHeader(
  lines: AnnotatedHunkLine[],
  hunkContext: string,
): string {
  const first = lines[0]
  const oldCount = lines.filter((line) => line.consumesOld).length
  const newCount = lines.filter((line) => line.consumesNew).length

  return `@@ -${first.oldBefore},${oldCount} +${first.newBefore},${newCount} @@${hunkContext}`
}

function normalizeContextLineCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DIFF_CONTEXT_LINES
  return Math.max(0, Math.floor(value))
}

function isHunkHeader(line: string): boolean {
  return HUNK_HEADER_RE.test(line)
}
