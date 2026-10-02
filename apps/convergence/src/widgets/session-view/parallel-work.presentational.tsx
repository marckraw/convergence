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
import {
  Button,
  Card,
  cn,
  EmptyState,
  FormError,
  IconButton,
  PanelHeader,
  Tooltip,
} from '@convergence/ui'
import {
  descendantActivity,
  parallelWorkCardTone,
  workRowKey,
  workStatus,
  workTitle,
  PARALLEL_WORK_CARD_TONE,
} from './parallel-work.pure'
import { parallelWorkReturnedRing } from './parallel-work.styles'

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
      new Map(
        rows
          .filter((row) => collapsed.has(workRowKey(row)))
          .map((row) => [workRowKey(row), descendantActivity(rows, row)]),
      ),
    [rows, collapsed],
  )
  const decisionIds = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          workRowKey(row),
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
  const selected = rows.find((row) => workRowKey(row) === selectedId)
  const decision = (row: ParallelWorkRow) => {
    const id = decisionIds.get(workRowKey(row))
    return id ? (
      <Button
        variant="link"
        onClick={() => props.onDecision?.(id)}
        className="text-left text-xs"
      >
        Waiting for your decision in the conversation →
      </Button>
    ) : null
  }
  const controls = (row: ParallelWorkRow) => {
    const state = stopStates.get(workRowKey(row))
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
          {/* Unavailable, they stay focusable and say why in our Tooltip (R2, CONV-27). */}
          <Button variant="secondary" disabledReason={messageReason}>
            Message
          </Button>
          <Button
            variant="secondary"
            disabledReason={stopReason}
            disabled={state?.pending}
            onClick={() => props.onStop?.(workRowKey(row))}
          >
            {state?.error && running ? 'Retry stop' : 'Stop'}
          </Button>
          {row.run && (
            <Button
              variant="ghost"
              onClick={() => props.onSpawn?.(row.run!.spawnedByItemId)}
            >
              View spawn
            </Button>
          )}
          {props.resultItems?.has(workRowKey(row)) && (
            <Button
              variant="ghost"
              onClick={() => props.onResult?.(workRowKey(row))}
            >
              View result
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => props.onDetails?.(workRowKey(row))}
          >
            Details
          </Button>
        </div>
        {state?.pending && running && (
          <p className="text-xs text-ink-muted">
            Stop requested… awaiting confirmation
          </p>
        )}
        <FormError>{state?.error}</FormError>
      </div>
    )
  }
  const content = (row: ParallelWorkRow) => {
    const time = parallelWorkTime(row, now)
    return (
      <>
        {/* R11: today's 13 px title is the nearest step, text-sm. */}
        <Button
          variant="link"
          onClick={() => props.onSelect(workRowKey(row))}
          className="block max-w-full truncate text-left text-sm font-medium"
        >
          {workTitle(row)}
        </Button>
        <p className="text-2xs text-ink-muted">
          {row.run
            ? `${row.run.agentType ?? 'Not reported'} · ${row.run.model ?? 'Not reported'} · depth ${row.run.depth ?? 'Not reported'}`
            : (row.task?.taskType ?? 'Not reported')}
        </p>
        <Tooltip label={time.at ?? undefined}>
          <p className="text-2xs">
            {workStatus(row)} · {time.label}
          </p>
        </Tooltip>
        {row.run && (
          <p className="text-2xs text-ink-muted">
            Last tool: {row.run.lastToolName ?? 'Not reported'}
          </p>
        )}
        {parallelWorkRowState(row).fact?.status === 'failed' && (
          <p className="text-xs text-danger-ink">
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
    const key = workRowKey(row)
    if (seen.has(key)) return null
    const next = new Set([...seen, key])
    const children = childrenById.get(row) ?? []
    const hidden = collapsed.has(key)
    const tone =
      PARALLEL_WORK_CARD_TONE[
        parallelWorkCardTone(parallelWorkRowState(row).fact?.status)
      ]
    const returned = props.highlightedId === key
    return (
      <div key={key} className="space-y-2">
        <Card
          tone={tone}
          className={cn('space-y-2', returned && parallelWorkReturnedRing)}
          data-work-id={key}
          data-tone={tone}
          data-returned={returned ? '' : undefined}
        >
          {children.length > 0 && (
            <Button
              variant="quiet"
              size="xs"
              aria-expanded={!hidden}
              aria-label={`${hidden ? 'Expand' : 'Collapse'} ${workTitle(row)}`}
              onClick={() => props.onToggle?.(key)}
              className="-ml-2 text-2xs"
            >
              {hidden ? (
                <ChevronRight className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              {hidden &&
                `${descendantCounts.get(key) ?? 0} descendants running`}
            </Button>
          )}
          {content(row)}
          {controls(row)}
        </Card>
        {!hidden && children.length > 0 && (
          <div className="ml-3.5 space-y-2 border-l border-line pl-3.5">
            {children.map((child) => renderBranch(child, next))}
          </div>
        )}
      </div>
    )
  }
  return (
    <aside
      aria-label="Parallel work"
      className="flex h-full min-h-0 w-full flex-col bg-canvas text-ink"
    >
      {/* The side panels' one header (CONV-20): 48 px, the title, a 28 px close. */}
      <PanelHeader
        title={
          selected ? (
            <Button variant="ghost" size="sm" onClick={props.onBack}>
              <ArrowLeft aria-hidden className="size-4" />
              Parallel work
            </Button>
          ) : (
            'Parallel work'
          )
        }
        actions={
          <IconButton
            label="Close parallel work"
            variant="quiet"
            size="sm"
            onClick={props.onClose}
          >
            <X aria-hidden className="size-3.5" />
          </IconButton>
        }
      />
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
        data-parallel-scroll
      >
        {!selected && (
          <p className="text-2xs text-ink-muted">{inventoryLabel}</p>
        )}
        {props.showEmpty !== false && !rows.length && (
          <EmptyState
            title="No parallel work yet"
            detail="Agents, background commands and monitors will appear here when this session starts them."
          />
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
                  aria-expanded={props.olderOpen ?? false}
                  onClick={props.onToggleOlder}
                  size="lg"
                  className="text-xs text-ink-muted"
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
