import type { FC, ReactNode } from 'react'
import { ArrowLeft, ChevronRight, X } from 'lucide-react'
import {
  parallelWorkClock,
  parallelWorkTime,
  parallelWorkRowState,
  type AttributedWorkItem,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import {
  Button,
  Card,
  cn,
  disclosureChevron,
  EmptyState,
  FormError,
  fullDateLabel,
  IconButton,
  MetaLine,
  PanelHeader,
  Timestamp,
  Tooltip,
} from '@convergence/ui'
import {
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

/**
 * What the panel draws its rows from, derived by its container (CONV-30):
 * the tree, the older rows folded away, the running counts under a folded
 * branch, the decisions waiting in the conversation, and the inventory line.
 */
export interface ParallelWorkPanelTree {
  roots: ParallelWorkRow[]
  childrenById: Map<ParallelWorkRow, ParallelWorkRow[]>
  /** Settled rows folded under "N older", and the newest one's time. */
  older: ParallelWorkRow[]
  newest: string | null
  archived: ReadonlySet<ParallelWorkRow>
  descendantCounts: Map<string, number>
  decisionIds: Map<string, string | undefined>
  inventory: string[]
}

const EMPTY_COLLAPSED = new Set<string>()

/**
 * The Parallel work panel: props in, markup out. ParallelWorkPanel, its
 * container, derives the tree it draws (CONV-30).
 */
export const ParallelWorkPanelView: FC<
  ParallelWorkPanelProps & { tree: ParallelWorkPanelTree }
> = (props) => {
  const {
    rows,
    now,
    selectedId,
    collapsed = EMPTY_COLLAPSED,
    stopStates = new Map(),
    tree,
  } = props
  const {
    roots,
    childrenById,
    archived,
    descendantCounts,
    decisionIds,
    inventory,
  } = tree
  const archive = { older: tree.older, newest: tree.newest }
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
        {row.run ? (
          <MetaLine wrap className="text-2xs text-ink-muted">
            {row.run.agentType ?? 'Not reported'}
            {row.run.model ?? 'Not reported'}
            {`depth ${row.run.depth ?? 'Not reported'}`}
          </MetaLine>
        ) : (
          <p className="text-2xs text-ink-muted">
            {row.task?.taskType ?? 'Not reported'}
          </p>
        )}
        {time.kind === 'duration' ? (
          // How long it has run is a span, in its own words; when it
          // started is in our Tooltip, as a Timestamp's (CONV-22).
          <Tooltip label={fullDateLabel(new Date(time.at))}>
            <MetaLine wrap className="text-2xs">
              {workStatus(row)}
              {time.label}
            </MetaLine>
          </Tooltip>
        ) : (
          // A moment is a Timestamp: its words, and the whole moment in
          // its Tooltip (CONV-22).
          <MetaLine wrap className="text-2xs">
            {workStatus(row)}
            {time.kind === 'moment' ? (
              <span>
                {time.prefix ? `${time.prefix} ` : null}
                <Timestamp date={time.at} now={new Date(time.now)} />
              </span>
            ) : (
              time.label
            )}
          </MetaLine>
        )}
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
          {/* One control folds the branch, so nothing changes under the
              pointer: its chevron turns a quarter, as a Collapsible's does
              (CONV-12). Folded, it says what it hides, and those words are
              its name; open, it is the chevron alone, named by its label.
              What it does is its tooltip (CONV-5). */}
          {children.length > 0 && (
            <Tooltip
              label={`${hidden ? 'Expand' : 'Collapse'} ${workTitle(row)}`}
            >
              <Button
                variant="quiet"
                size="xs"
                aria-expanded={!hidden}
                aria-label={hidden ? undefined : `Collapse ${workTitle(row)}`}
                onClick={() => props.onToggle?.(key)}
                className="-ml-2"
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    'size-3',
                    disclosureChevron,
                    !hidden && 'rotate-90',
                  )}
                />
                {hidden
                  ? `${descendantCounts.get(key) ?? 0} descendants running`
                  : null}
              </Button>
            </Tooltip>
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
          <MetaLine wrap className="text-2xs text-ink-muted">
            {inventory}
          </MetaLine>
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
                  size="md"
                  className="text-ink-muted"
                >
                  {/* Its facts on a MetaLine, its moment a Timestamp (CONV-23, CONV-22). */}
                  <MetaLine>
                    {`${archive.older.length} older`}
                    {archive.newest ? (
                      <span>
                        newest{' '}
                        <Timestamp
                          date={archive.newest}
                          now={new Date(parallelWorkClock(archive.newest, now))}
                        />
                      </span>
                    ) : (
                      'time not reported'
                    )}
                  </MetaLine>
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
