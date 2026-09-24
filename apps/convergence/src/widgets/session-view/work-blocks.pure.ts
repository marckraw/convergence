import type { ConversationItem } from '@/entities/session'

/**
 * Work blocks (MAR-3391 CV1): a run of tool items between two things a
 * person must read folds into one row. This file holds the ONE rule both
 * surfaces fold by -- the main transcript and the parallel-work sidebar --
 * and the label that row carries, built only from the members' own fields.
 */

/**
 * What an item may be in a work block (R1).
 *
 * - `tool`: a `tool-call`, or a `tool-result` that is not an error. It joins.
 * - `thinking`: joins only when it sits between two tool items.
 * - `boundary`: never folded. Every message (the agent's and yours), every
 *   approval, every question, every note, anything in `state: 'error'` and
 *   any entry the parallel-work markers speak for.
 */
export type WorkBlockRole = 'tool' | 'thinking' | 'boundary'

export function workBlockRole(
  item: ConversationItem,
  carriesParallelWorkMarker = false,
): WorkBlockRole {
  if (carriesParallelWorkMarker) return 'boundary'
  if (item.state === 'error') return 'boundary'
  if (item.kind === 'tool-call' || item.kind === 'tool-result') return 'tool'
  if (item.kind === 'thinking') return 'thinking'
  return 'boundary'
}

export type WorkRow<T> =
  | { kind: 'entry'; entry: T }
  | { kind: 'block'; id: string; members: T[] }

export interface GroupWorkBlocksOptions<T> {
  /** The entry the parallel-work markers speak for: always a boundary. */
  isMarked?: (entry: T) => boolean
  /**
   * A block may not swallow what is drawn ABOVE an entry (a turn divider, a
   * compaction marker): such an entry starts a new block instead. The entry
   * itself is unchanged -- it still folds, it just folds first.
   */
  startsNewBlock?: (entry: T) => boolean
}

/**
 * Folds a list of entries into rows (R1). A block is keyed by its first
 * member's id, which never changes as the block grows, so what is open stays
 * open while the agent works.
 */
export function groupWorkBlocks<T>(
  entries: readonly T[],
  itemOf: (entry: T) => ConversationItem,
  options: GroupWorkBlocksOptions<T> = {},
): WorkRow<T>[] {
  const rows: WorkRow<T>[] = []
  let block: T[] | null = null
  let pendingThinking: T[] = []

  const closeBlock = () => {
    if (block)
      rows.push({ kind: 'block', id: itemOf(block[0]!).id, members: block })
    block = null
    for (const entry of pendingThinking) rows.push({ kind: 'entry', entry })
    pendingThinking = []
  }

  for (const entry of entries) {
    const role = workBlockRole(
      itemOf(entry),
      options.isMarked?.(entry) ?? false,
    )
    const split = options.startsNewBlock?.(entry) ?? false

    if (role === 'tool') {
      if (block && !split) {
        block.push(...pendingThinking, entry)
        pendingThinking = []
      } else {
        closeBlock()
        block = [entry]
      }
      continue
    }

    if (role === 'thinking' && block && !split) {
      pendingThinking.push(entry)
      continue
    }

    closeBlock()
    rows.push({ kind: 'entry', entry })
  }

  closeBlock()
  return rows
}

/** Which block (by id) each folded member belongs to. */
export function workBlockMembership<T>(
  rows: readonly WorkRow<T>[],
  itemOf: (entry: T) => ConversationItem,
): Map<string, string> {
  const byMember = new Map<string, string>()
  for (const row of rows) {
    if (row.kind !== 'block') continue
    for (const member of row.members) byMember.set(itemOf(member).id, row.id)
  }
  return byMember
}

/**
 * One drawn row of a transcript that folds: an entry as today, a block's own
 * line, or -- when that block is open -- one of its members, drawn as today
 * beneath it. Open members stay separate rows so a virtualizer can still
 * measure them one by one and land on any of them (R6).
 */
export type WorkDisplayRow<T> =
  | { kind: 'entry'; key: string; entry: T }
  | { kind: 'block'; key: string; id: string; members: T[]; open: boolean }
  | { kind: 'member'; key: string; blockId: string; entry: T; last: boolean }

export function workDisplayRows<T>(
  rows: readonly WorkRow<T>[],
  itemOf: (entry: T) => ConversationItem,
  isOpen: (blockId: string) => boolean,
): WorkDisplayRow<T>[] {
  const display: WorkDisplayRow<T>[] = []
  for (const row of rows) {
    if (row.kind === 'entry') {
      display.push({
        kind: 'entry',
        key: itemOf(row.entry).id,
        entry: row.entry,
      })
      continue
    }
    const open = isOpen(row.id)
    display.push({
      kind: 'block',
      key: `work-block:${row.id}`,
      id: row.id,
      members: row.members,
      open,
    })
    if (!open) continue
    row.members.forEach((entry, index) =>
      display.push({
        kind: 'member',
        key: itemOf(entry).id,
        blockId: row.id,
        entry,
        last: index === row.members.length - 1,
      }),
    )
  }
  return display
}

/** Every entry, drawn as today: the Full view (R5). */
export function fullDisplayRows<T>(
  entries: readonly T[],
  itemOf: (entry: T) => ConversationItem,
): WorkDisplayRow<T>[] {
  return entries.map((entry) => ({
    kind: 'entry',
    key: itemOf(entry).id,
    entry,
  }))
}

// ---------------------------------------------------------------------------
// The label (R2): facts only.
// ---------------------------------------------------------------------------

export type WorkVerb = 'read' | 'search' | 'edit' | 'run' | 'other'

/**
 * Tool names to verbs, the one table (R2). Matched case-insensitively and
 * exactly: Claude Code's `Read`, Pi's `read`, and the other names the
 * providers write. A name this table does not know is `other` -- never a
 * guess from a substring.
 */
export const WORK_VERB_BY_TOOL_NAME: Readonly<Record<string, WorkVerb>> = {
  read: 'read',
  notebookread: 'read',
  read_file: 'read',
  view: 'read',
  grep: 'search',
  glob: 'search',
  ls: 'search',
  find: 'search',
  websearch: 'search',
  edit: 'edit',
  multiedit: 'edit',
  write: 'edit',
  notebookedit: 'edit',
  apply_patch: 'edit',
  bash: 'run',
  shell: 'run',
  exec_command: 'run',
}

export function workVerbForToolName(toolName: string): WorkVerb {
  return WORK_VERB_BY_TOOL_NAME[toolName.trim().toLowerCase()] ?? 'other'
}

/**
 * Codex writes no tool calls: each step arrives as a result, typed by its
 * event (`toolName` is the whole command string for a command). These are
 * the only results that count as steps of their own.
 */
const STEP_VERB_BY_RESULT_EVENT: Readonly<Record<string, WorkVerb>> = {
  commandExecution: 'run',
  fileChange: 'edit',
  mcpToolCall: 'other',
}

const PATH_FIELDS = ['file_path', 'path', 'notebook_path'] as const

/**
 * A path counts only if `inputText` parses as a JSON object carrying one of
 * the path fields. Free text (Cursor's titles, a command) is never a path.
 */
export function parseToolInputPath(inputText: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(inputText)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return null
  for (const field of PATH_FIELDS) {
    const value = (parsed as Record<string, unknown>)[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

interface WorkStep {
  verb: WorkVerb
  path: string | null
}

/**
 * The steps a block's members took. A call is a step. A result is a step of
 * its own only when it answers no call: Claude Code and Cursor link their
 * results to the call, Pi's results follow their call unlinked, and only
 * Codex's typed results stand alone.
 */
export function workSteps(items: readonly ConversationItem[]): WorkStep[] {
  const steps: WorkStep[] = []
  for (const item of items) {
    if (item.kind === 'tool-call') {
      steps.push({
        verb: workVerbForToolName(item.toolName),
        path: parseToolInputPath(item.inputText),
      })
      continue
    }
    if (item.kind === 'tool-result' && item.relatedItemId === null) {
      const verb =
        STEP_VERB_BY_RESULT_EVENT[item.providerMeta.providerEventType ?? '']
      if (verb) steps.push({ verb, path: null })
    }
  }
  return steps
}

function directoryOf(path: string): string[] {
  const segments = path.split('/')
  segments.pop()
  return segments
}

/**
 * The deepest folder every path sits in. Only a folder all of them share --
 * never the first one's, never a guess -- and none when fewer than two paths
 * were read from the members.
 */
export function commonFolder(
  paths: readonly string[],
  root: string | null = null,
): string | null {
  if (paths.length < 2) return null
  let common = directoryOf(paths[0]!)
  for (const path of paths.slice(1)) {
    const segments = directoryOf(path)
    let length = 0
    while (
      length < common.length &&
      length < segments.length &&
      common[length] === segments[length]
    )
      length += 1
    common = common.slice(0, length)
  }
  const folder = common.join('/')
  if (!folder || folder === '.') return null
  const trimmedRoot = root?.replace(/\/+$/, '') ?? null
  if (trimmedRoot) {
    if (folder === trimmedRoot) return null
    if (folder.startsWith(`${trimmedRoot}/`))
      return folder.slice(trimmedRoot.length + 1)
  }
  return folder
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

const VERB_ORDER: readonly WorkVerb[] = [
  'read',
  'search',
  'edit',
  'run',
  'other',
]

/**
 * The block's line, in lower case (`read 10 files in src/x · 3 searches`).
 * Counts per verb; files are counted by distinct path only when every step of
 * that verb carried one, else the steps themselves are counted. A block of
 * results that answer calls outside it says how many results it holds.
 */
export function workBlockSummary(
  items: readonly ConversationItem[],
  root: string | null = null,
): string {
  const steps = workSteps(items)
  if (steps.length === 0) {
    const results = items.filter((item) => item.kind === 'tool-result').length
    return results > 0
      ? plural(results, 'tool result', 'tool results')
      : plural(items.length, 'step', 'steps')
  }

  const byVerb = new Map<WorkVerb, WorkStep[]>()
  for (const step of steps) {
    byVerb.set(step.verb, [...(byVerb.get(step.verb) ?? []), step])
  }
  const paths = steps.flatMap((step) => (step.path ? [step.path] : []))
  const folder = commonFolder(paths, root)

  let folderPlaced = false
  const parts: string[] = []
  for (const verb of VERB_ORDER) {
    const verbSteps = byVerb.get(verb)
    if (!verbSteps) continue
    let part = describeVerb(verb, verbSteps)
    if (folder && !folderPlaced && verbSteps.some((step) => step.path)) {
      part = `${part} in ${folder}`
      folderPlaced = true
    }
    parts.push(part)
  }
  return parts.join(' · ')
}

function describeVerb(verb: WorkVerb, steps: readonly WorkStep[]): string {
  const allPathed = steps.every((step) => step.path)
  const files = new Set(steps.map((step) => step.path)).size
  switch (verb) {
    case 'read':
      return allPathed
        ? `read ${plural(files, 'file', 'files')}`
        : plural(steps.length, 'read', 'reads')
    case 'edit':
      return allPathed
        ? `edited ${plural(files, 'file', 'files')}`
        : plural(steps.length, 'edit', 'edits')
    case 'search':
      return plural(steps.length, 'search', 'searches')
    case 'run':
      return `ran ${plural(steps.length, 'command', 'commands')}`
    case 'other':
      return plural(steps.length, 'tool call', 'tool calls')
  }
}

/**
 * What the block's row says (R2, R4). A block the agent is still adding to
 * reads `Working… <facts>`; a closed one reads its facts, capitalised.
 */
export function workBlockLabel(
  items: readonly ConversationItem[],
  options: { working: boolean; root?: string | null },
): string {
  const summary = workBlockSummary(items, options.root ?? null)
  if (options.working) return `Working… ${summary}`
  return summary.charAt(0).toUpperCase() + summary.slice(1)
}
