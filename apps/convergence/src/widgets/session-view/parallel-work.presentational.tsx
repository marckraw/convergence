import { useMemo, type FC, type ReactNode } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, X } from 'lucide-react'
import {
  countParallelWork,
  orderParallelWork,
  parallelWorkParents,
  archiveParallelWork,
  parallelWorkTime,
  formatRelativeTime,
  parallelWorkRowState,
  pendingAgentDecision,
  type AttributedWorkItem,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import { Button } from '@/shared/ui/button'
import { descendantActivity, workStatus, workTitle } from './parallel-work.pure'

export interface ParallelWorkPanelProps {
  olderOpen?: boolean
  onToggleOlder?: () => void
  rows: ParallelWorkRow[]
  now: number
  onSelect: (id: string) => void
  onClose: () => void
  items?: AttributedWorkItem[]
  highlightedId?: string | null
  showEmpty?: boolean
  selectedId?: string | null
  collapsed?: Set<string>
  onToggle?: (id: string) => void
  onBack?: () => void
  onDecision?: (id: string) => void
  onStop?: (id: string) => void
  onDetails?: (id: string) => void
  onSpawn?: (id: string) => void
  onResult?: (id: string) => void
  resultItems?: Map<string, string>
  canStop?: boolean
  stopStates?: Map<string, { pending?: boolean; error?: string }>
  transcript?: ReactNode
  details?: ReactNode
}

const EMPTY_ITEMS: AttributedWorkItem[] = []
const EMPTY_COLLAPSED = new Set<string>()

export const ParallelWorkPanel: FC<ParallelWorkPanelProps> = (props) => {
  const {
    rows,
    now,
    selectedId,
    items = EMPTY_ITEMS,
    collapsed = EMPTY_COLLAPSED,
    stopStates = new Map(),
  } = props
  const ordered = useMemo(() => orderParallelWork(rows), [rows])
  const archive = useMemo(
    () => archiveParallelWork(ordered, now),
    [ordered, now],
  )
  const archived = useMemo(() => new Set(archive.older), [archive])
  const { counts, completed, childrenById, roots } = useMemo(() => {
    const childrenById = new Map<ParallelWorkRow, ParallelWorkRow[]>()
    const parents = parallelWorkParents(rows)
    for (const row of ordered) {
      const parent = row.parentId ? parents.get(row.parentId) : undefined
      if (parent) {
        const children = childrenById.get(parent) ?? []
        children.push(row)
        childrenById.set(parent, children)
      }
    }
    return {
      counts: countParallelWork(rows),
      completed: rows.filter(
        (row) => parallelWorkRowState(row).fact?.status === 'completed',
      ).length,
      childrenById,
      roots: ordered.filter(
        (row) => !row.parentId || !parents.has(row.parentId),
      ),
    }
  }, [rows, ordered])
  const descendantCounts = useMemo(
    () =>
      new Map([...collapsed].map((id) => [id, descendantActivity(rows, id)])),
    [rows, collapsed],
  )
  const decisionIds = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.id,
          parallelWorkRowState(row)
            .ids.map((id) => pendingAgentDecision(items, id))
            .find(Boolean),
        ]),
      ),
    [rows, items],
  )
  const inventoryLabel = [
    'This session',
    `${counts.running} running`,
    `${completed} completed`,
    ...(counts.unknown ? [`${counts.unknown} unknown`] : []),
    ...(counts.failed ? [`${counts.failed} failed`] : []),
    ...(counts.stopped ? [`${counts.stopped} stopped`] : []),
  ].join(' · ')
  const selected = rows.find((row) => row.id === selectedId)
  const decision = (row: ParallelWorkRow) => {
    const id = decisionIds.get(row.id)
    return id ? (
      <Button
        variant="ghost"
        className="h-auto justify-start rounded-none p-0 hover:bg-transparent text-left text-xs text-blue-500 hover:underline"
        onClick={() => props.onDecision?.(id)}
      >
        Waiting for your decision in the conversation →
      </Button>
    ) : null
  }
  const controls = (row: ParallelWorkRow) => {
    const state = stopStates.get(row.id)
    const running = parallelWorkRowState(row).fact?.status === 'running'
    const stopReason = !props.canStop
      ? 'Stop is not available on this Claude Code version'
      : !running
        ? 'This task is not running'
        : undefined
    const messageReason =
      row.kind === 'task'
        ? 'Message unavailable for a monitor/background command'
        : 'Message is not available on this Claude Code version'
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <span title={messageReason}>
            <Button
              variant="outline"
              size="sm"
              disabled
              aria-label={messageReason}
            >
              Message
            </Button>
          </span>
          <span title={stopReason}>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(stopReason) || state?.pending}
              onClick={() => props.onStop?.(row.id)}
            >
              {state?.error && running ? 'Retry stop' : 'Stop'}
            </Button>
          </span>
          {row.run && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => props.onSpawn?.(row.run!.spawnedByItemId)}
            >
              View spawn
            </Button>
          )}
          {props.resultItems?.has(row.id) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => props.onResult?.(row.id)}
            >
              View result
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => props.onDetails?.(row.id)}
          >
            Details
          </Button>
        </div>
        {state?.pending && running && (
          <p className="text-xs text-muted-foreground">
            Stop requested… awaiting confirmation
          </p>
        )}
        {state?.error && (
          <p role="alert" className="text-xs text-red-500">
            {state.error}
          </p>
        )}
      </div>
    )
  }
  const content = (row: ParallelWorkRow) => {
    const time = parallelWorkTime(row, now)
    return (
      <>
        <Button
          variant="ghost"
          className="h-auto justify-start rounded-none p-0 hover:bg-transparent block max-w-full truncate text-left text-[13px] font-medium hover:underline"
          onClick={() => props.onSelect(row.id)}
        >
          {workTitle(row)}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          {row.run
            ? `${row.run.agentType ?? 'Not reported'} · ${row.run.model ?? 'Not reported'} · depth ${row.run.depth ?? 'Not reported'}`
            : (row.task?.taskType ?? 'Not reported')}
        </p>
        <p className="text-[11px]" title={time.at ?? undefined}>
          {workStatus(row)} · {time.label}
        </p>
        {row.run && (
          <p className="text-[11px] text-muted-foreground">
            Last tool: {row.run.lastToolName ?? 'Not reported'}
          </p>
        )}
        {parallelWorkRowState(row).fact?.status === 'failed' && (
          <p className="text-xs text-red-500">
            {parallelWorkRowState(row).fact?.endedSummary
              ? `Reported by the harness: ${parallelWorkRowState(row).fact!.endedSummary}`
              : 'Not reported'}
          </p>
        )}
        {decision(row)}
      </>
    )
  }
  const renderBranch = (
    row: ParallelWorkRow,
    seen = new Set<string>(),
  ): ReactNode => {
    const key = `${row.kind}:${row.id}`
    if (seen.has(key)) return null
    const next = new Set([...seen, key])
    const children = childrenById.get(row) ?? []
    const hidden = collapsed.has(row.id)
    return (
      <div key={`${row.kind}:${row.id}`} className="space-y-2">
        <div
          className={`space-y-2 rounded-md border p-3 ${props.highlightedId === row.id ? 'border-blue-500/40 bg-blue-500/10' : 'border-border/50 bg-muted/30'}`}
          data-work-id={row.id}
        >
          {children.length > 0 && (
            <Button
              variant="ghost"
              className="h-auto justify-start rounded-none p-0 hover:bg-transparent flex items-center gap-1 text-[11px] text-muted-foreground"
              aria-expanded={!hidden}
              aria-label={`${hidden ? 'Expand' : 'Collapse'} ${workTitle(row)}`}
              onClick={() => props.onToggle?.(row.id)}
            >
              {hidden ? (
                <ChevronRight className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              {hidden &&
                `${descendantCounts.get(row.id) ?? 0} descendants running`}
            </Button>
          )}
          {content(row)}
          {controls(row)}
        </div>
        {!hidden && children.length > 0 && (
          <div className="ml-3.5 space-y-2 border-l border-border pl-3.5">
            {children.map((child) => renderBranch(child, next))}
          </div>
        )}
      </div>
    )
  }
  return (
    <aside
      aria-label="Parallel work"
      className="flex h-full min-h-0 w-full flex-col bg-background text-foreground"
    >
      <header className="flex shrink-0 items-center justify-between border-b p-5">
        {selected ? (
          <Button
            variant="ghost"
            className="h-auto justify-start rounded-none p-0 hover:bg-transparent flex items-center gap-2 text-sm"
            onClick={props.onBack}
          >
            <ArrowLeft className="size-4" />
            Parallel work
          </Button>
        ) : (
          <div>
            <h2 className="text-base font-semibold">Parallel work</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {inventoryLabel}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={props.onClose}
          aria-label="Close parallel work"
        >
          <X className="size-4" />
        </Button>
      </header>
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
        data-parallel-scroll
      >
        {props.showEmpty !== false && !rows.length && (
          <p className="text-sm text-muted-foreground">
            No parallel work yet. Agents, background commands and monitors will
            appear here when this session starts them.
          </p>
        )}
        {selected ? (
          <>
            <div className="space-y-2">
              {content(selected)}
              {controls(selected)}
            </div>
            {props.details ?? props.transcript}
          </>
        ) : (
          <>
            {roots
              .filter((row) => !archived.has(row))
              .map((row) => renderBranch(row))}
            {archive.older.length > 0 && (
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  aria-expanded={props.olderOpen ?? false}
                  onClick={props.onToggleOlder}
                >
                  {archive.older.length} older ·{' '}
                  {archive.newest
                    ? `newest ${formatRelativeTime(archive.newest, now)} ago`
                    : 'time not reported'}
                </Button>
                {props.olderOpen &&
                  roots
                    .filter((row) => archived.has(row))
                    .map((row) => renderBranch(row))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
