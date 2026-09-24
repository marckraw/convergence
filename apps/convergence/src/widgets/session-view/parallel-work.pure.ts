import {
  isSubagentWork,
  parallelWorkParents,
  parallelWorkRowState,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import type { ConversationItem } from '@/entities/session'
import type {
  SessionAgentRun,
  SessionTask,
} from '@/shared/types/harness-evidence.types'

/** Two reads of one session's evidence that say the same thing. */
export function sameParallelWorkEvidence(
  previous: { runs: readonly SessionAgentRun[]; tasks: readonly SessionTask[] },
  next: { runs: readonly SessionAgentRun[]; tasks: readonly SessionTask[] },
): boolean {
  return (
    JSON.stringify(previous.runs) === JSON.stringify(next.runs) &&
    JSON.stringify(previous.tasks) === JSON.stringify(next.tasks)
  )
}

/**
 * The loaded conversation plus what a by-id read fetched that the loaded list
 * does not hold, deduplicated by id, in `sequence` order (MAR-3310 O0b R2).
 *
 * The loaded copy of an item always wins: it may be newer than the fetched
 * one, or still streaming — a subagent's live text is tied to the loaded
 * object (F1e). When the read adds nothing, which on a fully loaded
 * conversation is every time, the loaded list itself comes back, so every
 * surface computed from it keeps its identity and is exactly today's.
 */
export function withFetchedWorkItems<
  T extends { id: string; sequence: number },
>(loaded: T[], fetched: readonly T[]): T[] {
  if (!fetched.length) return loaded
  const held = new Set(loaded.map((item) => item.id))
  const added = new Map<string, T>()
  for (const item of fetched)
    if (!held.has(item.id) && !added.has(item.id)) added.set(item.id, item)
  if (!added.size) return loaded
  return [...loaded, ...added.values()].sort((a, b) => a.sequence - b.sequence)
}

/**
 * A row's detail: an agent's own transcript, or a task's tool calls and
 * results. The same filter the panel has always applied, now over the loaded
 * list merged with the row's by-id read (MAR-3310 O0b R2).
 */
export function parallelWorkDetailItems(
  items: readonly ConversationItem[],
  row: ParallelWorkRow,
): ConversationItem[] {
  const { ids } = parallelWorkRowState(row)
  return items.filter((item) =>
    row.kind === 'agent'
      ? ids.includes(item.agentRunId ?? '') && isSubagentWork(item)
      : ids.includes(item.taskId ?? '') &&
        ['tool-call', 'tool-result'].includes(item.kind),
  )
}

export interface ParallelWorkMarker {
  /**
   * The row the marker points at, as `${kind}:${id}` — the same key every
   * per-row surface in the panel uses. A marker is the only other place a
   * selection is born, and a bare id here would resolve to whichever of a
   * same-id agent and task came first in the list (MAR-2902).
   */
  rowKey: string
  label: string
  replace: boolean
}

/**
 * The identity of a row in the panel, and the only key any per-row surface may
 * use: collapse, select, confirm, stop state, the ancestor walk and
 * `data-work-id`.
 *
 * A row's `id` is the harness's own — a run id for an agent row, a task id for
 * a task row — and the two namespaces are not disjoint: a non-`local_agent`
 * task whose id equals a run id produces two rows that a bare-id key cannot
 * tell apart. Collapsing one collapsed both, and a selection resolved to
 * whichever row `find` reached first (MAR-2902).
 */
export function workRowKey(row: ParallelWorkRow): string {
  return `${row.kind}:${row.id}`
}

export function parallelWorkMarkers(
  items: ConversationItem[],
  rows: ParallelWorkRow[],
): Map<string, ParallelWorkMarker> {
  const markers = new Map<string, ParallelWorkMarker>()
  const runsBySpawn = new Map(
    rows.filter((row) => row.run).map((row) => [row.run!.spawnedByItemId, row]),
  )
  const runsById = new Map(
    rows
      .filter((row) => row.run)
      .flatMap((row) =>
        parallelWorkRowState(row).ids.map((id) => [id, row] as const),
      ),
  )
  const returned = new Set<string>()
  for (const item of items) {
    const spawn = runsBySpawn.get(item.id)
    if (spawn && item.kind === 'tool-call') {
      const parent = spawn.parentId ? runsById.get(spawn.parentId) : null
      markers.set(item.id, {
        rowKey: workRowKey(spawn),
        replace: true,
        label: `Started ${spawn.run!.agentType ?? 'Subagent'} · ${workTitle(spawn)}${parent ? ` · from ${workTitle(parent)}` : ''}`,
      })
      continue
    }
    const row =
      item.kind === 'tool-result' && item.relatedItemId
        ? runsBySpawn.get(item.relatedItemId)
        : item.kind === 'note' && item.taskId
          ? runsById.get(item.taskId)
          : null
    if (!row) continue
    const eventType = item.providerMeta.providerEventType
    if (eventType === 'tool_result.async_launched') {
      markers.set(item.id, {
        rowKey: workRowKey(row),
        replace: true,
        label: `launched · ${workTitle(row)}`,
      })
    } else if (
      !returned.has(workRowKey(row)) &&
      [
        'tool_result.completed',
        'tool_result.failed',
        'harness.task.terminal',
      ].includes(eventType ?? '')
    ) {
      returned.add(workRowKey(row))
      const outcome =
        eventType === 'tool_result.failed'
          ? 'failed'
          : eventType === 'tool_result.completed'
            ? 'completed'
            : parallelWorkRowState(row).fact?.status
      markers.set(item.id, {
        rowKey: workRowKey(row),
        replace: item.kind !== 'note',
        label: `Result returned · ${workTitle(row)} · ${outcome}`,
      })
    }
  }
  return markers
}

export function workTitle(row: ParallelWorkRow): string {
  return (
    row.run?.description ||
    row.task?.description ||
    (row.kind === 'agent' ? 'Subagent' : 'Background task')
  )
}

export function workStatus(row: ParallelWorkRow): string {
  const fact = parallelWorkRowState(row).fact
  if (fact?.status === 'stopped') {
    switch (fact.stopReason) {
      case 'quit':
        return 'Stopped by quit'
      case 'idle':
        return 'Stopped after idle timeout'
      case 'account':
        return 'Stopped by account change'
      case 'maintenance':
        return 'Stopped for account maintenance'
      case 'stop':
        return 'Stopped by you'
      default:
        return 'Stopped'
    }
  }
  if (fact?.status === 'unknown') return 'Unknown'
  return fact?.status === 'running'
    ? 'Running'
    : fact?.status === 'failed'
      ? 'Failed'
      : 'Completed'
}

/**
 * How many running rows hang below this one.
 *
 * The walk takes a ROW rather than an id, and resolves each child's `parentId`
 * through `parallelWorkParents` — the same resolution the panel uses to build
 * its tree, so the collapsed count and the branch it decorates cannot disagree.
 * A bare-id walk could not tell a task row from an agent row sharing its id,
 * and handed the task the agent's descendants (MAR-2902).
 */
export function descendantActivity(
  rows: ParallelWorkRow[],
  row: ParallelWorkRow,
): number {
  const parents = parallelWorkParents(rows)
  const visited = new Set([workRowKey(row)])
  let count = 0
  const visit = (parent: ParallelWorkRow) => {
    for (const child of rows) {
      if (!child.parentId || parents.get(child.parentId) !== parent) continue
      const key = workRowKey(child)
      if (visited.has(key)) continue
      visited.add(key)
      if (parallelWorkRowState(child).fact?.status === 'running') count++
      visit(child)
    }
  }
  visit(row)
  return count
}

export function parallelWorkRefusal(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(
    /^Error invoking remote method ['"]session:stopTask['"]: (?:Error: )?/,
    '',
  )
}

export type ParallelWorkCardTone =
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'none'

/**
 * A card's tone is the row's own state and nothing else.
 *
 * Every other word the harness can report — `unknown` today, whatever a newer
 * harness adds tomorrow — is `none`: a card wears a colour only when the
 * colour is a fact. Before MAR-3308 the single tint was keyed on the panel's
 * selection memory, so the blue on a card meant "the one you last opened" and
 * a running subagent looked exactly like a finished one until you opened it.
 */
export function parallelWorkCardTone(status?: string): ParallelWorkCardTone {
  switch (status) {
    case 'running':
    case 'completed':
    case 'failed':
    case 'stopped':
      return status
    default:
      return 'none'
  }
}

/**
 * The classes must stay literal here: Tailwind reads source text, so a tone
 * assembled from parts (`border-${colour}-500/40`) would generate no CSS and
 * the card would silently lose its colour.
 */
export const PARALLEL_WORK_CARD_TONE_CLASS: Record<
  ParallelWorkCardTone,
  string
> = {
  running: 'border-blue-500/40 bg-blue-500/10',
  completed: 'border-emerald-500/30 bg-emerald-500/[0.06]',
  failed: 'border-red-500/40 bg-red-500/10',
  stopped: 'border-amber-500/30 bg-amber-500/[0.06]',
  none: 'border-border/50 bg-muted/30',
}

/**
 * The mark for the card you came back to from a detail view. A ring rather
 * than a tint, so it sits on top of the state tone instead of replacing it.
 */
export const PARALLEL_WORK_RETURNED_CLASS = 'ring-1 ring-inset ring-blue-500/50'
