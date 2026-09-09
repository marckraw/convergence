import { useMemo, type FC, type ReactNode } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, X } from 'lucide-react'
import {
  countParallelWork,
  pendingAgentDecision,
  type AttributedWorkItem,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import { Button } from '@/shared/ui/button'
import {
  descendantActivity,
  workElapsed,
  workStatus,
  workTitle,
} from './parallel-work.pure'

export interface ParallelWorkPanelProps {
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

export const ParallelWorkPanel: FC<ParallelWorkPanelProps> = (props) => {
  const {
    rows,
    now,
    selectedId,
    items = EMPTY_ITEMS,
    collapsed = new Set(),
    stopStates = new Map(),
  } = props
  const { counts, completed, descendantCounts, decisionIds, childrenById } =
    useMemo(() => {
      const childrenById = new Map<string, ParallelWorkRow[]>()
      for (const row of rows)
        if (row.parentId) {
          const children = childrenById.get(row.parentId) ?? []
          children.push(row)
          childrenById.set(row.parentId, children)
        }
      return {
        counts: countParallelWork(rows),
        completed: rows.filter(
          (row) => (row.run ?? row.task)?.status === 'completed',
        ).length,
        descendantCounts: new Map(
          rows.map((row) => [row.id, descendantActivity(rows, row.id)]),
        ),
        decisionIds: new Map(
          rows.map((row) => [row.id, pendingAgentDecision(items, row.id)]),
        ),
        childrenById,
      }
    }, [rows, items])
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
    const running = (row.run ?? row.task)?.status === 'running'
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
        {state?.error && running && (
          <p role="alert" className="text-xs text-red-500">
            {state.error}
          </p>
        )}
      </div>
    )
  }
  const content = (row: ParallelWorkRow) => (
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
      <p className="text-[11px]">
        {workStatus(row)} · {workElapsed(row, now)}
      </p>
      {row.run && (
        <p className="text-[11px] text-muted-foreground">
          Last tool: {row.run.lastToolName ?? 'Not reported'}
        </p>
      )}
      {(row.run ?? row.task)?.status === 'failed' && (
        <p className="text-xs text-red-500">
          {(row.run ?? row.task)?.endedSummary
            ? `Reported by the harness: ${(row.run ?? row.task)!.endedSummary}`
            : 'Not reported'}
        </p>
      )}
      {decision(row)}
    </>
  )
  const renderBranch = (
    row: ParallelWorkRow,
    seen = new Set<string>(),
  ): ReactNode => {
    if (seen.has(row.id)) return null
    const next = new Set([...seen, row.id])
    const children = childrenById.get(row.id) ?? []
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
            {rows.some((row) => row.kind === 'agent') && (
              <section className="space-y-2">
                <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Agents
                </h3>
                {rows
                  .filter((row) => row.kind === 'agent' && !row.parentId)
                  .map((row) => renderBranch(row))}
              </section>
            )}
            {rows.some((row) => row.kind === 'task') && (
              <section className="space-y-2">
                <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Commands and monitors
                </h3>
                {rows
                  .filter((row) => row.kind === 'task')
                  .map((row) => renderBranch(row))}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
