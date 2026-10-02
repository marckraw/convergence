import type { FC } from 'react'
import { X } from 'lucide-react'
import {
  Button,
  Card,
  CardAction,
  cn,
  EmptyState,
  FormError,
  SectionLabel,
  SegmentedControl,
  SegmentedControlItem,
  toneInk,
} from '@convergence/ui'
import { HISTORY_TONE, TONE_FRAME } from './hop-tone.styles'
import { HistoryEventRowView } from './history-event-row.presentational'
import { ROW_CARD_DOOR_CLASS, ROW_CARD_PICKED_CLASS } from './row-card.styles'
import { HISTORY_FILTERS } from './run-history.pure'
import type {
  HistoryEventRow,
  HistoryFilter,
  HistoryLapGroup,
  HistoryPanelState,
  HistoryRunRow,
} from './run-history.pure'

interface HistoryPanelProps {
  crewName: string
  state: HistoryPanelState
  runs: readonly HistoryRunRow[]
  selectedRunId: string | null
  /** The selected run's header line: "One run · 3 laps · 9 deliveries". */
  summary: string | null
  laps: readonly HistoryLapGroup[]
  /** The calls this run made, after its deliveries. */
  calls: readonly HistoryEventRow[]
  /** Calls that belong to no run at all. */
  unattributedCalls: readonly HistoryEventRow[]
  selectedEventId: string | null
  filter: HistoryFilter
  loadError: string | null
  /** The page saw another run below the ones it returned (L2). */
  hasMore: boolean
  loadingOlder: boolean
  olderError: string | null
  onLoadOlder: () => void
  onFilterChange: (filter: HistoryFilter) => void
  onSelectRun: (flowRunId: string) => void
  onSelectEvent: (eventId: string) => void
  onRetry: () => void
  onClose: () => void
}

/**
 * History, under the graph.
 *
 * A run list on the left and that run's events on the right, which is the
 * shape the design chose because the question is always two-step: *which
 * attempt*, then *what happened in it*.
 *
 * **Nothing here retries a delivery.** Reloading records after a load error
 * reads the ledger again; changing a filter changes the view. Both say so, in
 * the places somebody might reasonably fear otherwise.
 */
export const HistoryPanel: FC<HistoryPanelProps> = ({
  crewName,
  state,
  runs,
  selectedRunId,
  summary,
  laps,
  calls,
  unattributedCalls,
  selectedEventId,
  filter,
  loadError,
  hasMore,
  loadingOlder,
  olderError,
  onLoadOlder,
  onFilterChange,
  onSelectRun,
  onSelectEvent,
  onRetry,
  onClose,
}) => (
  <section
    data-history-panel
    aria-label="History"
    // 23/50 of the column: the canvas keeps the larger half above it.
    className="flex h-23/50 min-h-0 shrink-0 flex-col border-t border-hairline"
  >
    <div className="flex items-center gap-3 px-5 py-2">
      <h3 className="text-sm font-medium">History</h3>
      <p className="text-2xs text-ink-muted">{crewName}</p>

      {/* One filter of a few (MC-7): a segmented radio group. */}
      <SegmentedControl
        aria-label="Which runs to show"
        size="xs"
        value={filter}
        onValueChange={(value) => onFilterChange(value as HistoryFilter)}
        className="ml-auto"
      >
        {HISTORY_FILTERS.map((entry) => (
          <SegmentedControlItem key={entry.value} value={entry.value}>
            {entry.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>

      <Button
        type="button"
        variant="ghost"
        aria-label="Close history"
        onClick={onClose}
        size="sm"
        className="text-2xs gap-2"
      >
        <X className="size-3.5" />
        Close
      </Button>
    </div>

    {/* Four states, and they are four sentences (promise 7). Loading keeps
        its own two lines: the second is a promise, and it shows at once,
        where EmptyState's loading waits 300 ms before it says anything. */}
    {state === 'loading' ? (
      <div
        role="status"
        className="flex flex-1 flex-col items-center justify-center gap-1 text-center"
      >
        <p className="text-xs">Loading history…</p>
        <p className="text-2xs text-ink-muted">
          Keep the selected run while records load.
        </p>
      </div>
    ) : state === 'error' ? (
      <EmptyState
        state="failed"
        variant="plain"
        size="compact"
        layout="centred"
        title="Couldn’t load history"
        detail={
          <>
            <span className="block">
              {loadError ?? 'Try loading this crew’s history again.'}
            </span>
            <span className="block text-3xs">
              Reloads records only. Does not retry a delivery.
            </span>
          </>
        }
        onRetry={onRetry}
      />
    ) : state === 'empty' ? (
      <EmptyState
        variant="plain"
        size="compact"
        layout="centred"
        title="No history available yet"
        detail={
          <>
            <span className="block">
              There are no recorded events for this crew. Activity will appear
              here when a connection is evaluated.
            </span>
            <span className="block text-3xs">
              No records does not imply this crew has never run.
            </span>
          </>
        }
      />
    ) : state === 'no-match' ? (
      <EmptyState
        variant="plain"
        size="compact"
        layout="centred"
        title="No matching events"
        detail={
          <>
            <span className="block">
              There are recorded events, but none match these filters.
            </span>
            <span className="block text-3xs">
              Filters change the view, not the record.
            </span>
          </>
        }
        action={
          <Button
            type="button"
            variant="tonal"
            onClick={() => onFilterChange('all')}
            size="sm"
            className="px-3 text-2xs"
          >
            Clear history filters
          </Button>
        }
      />
    ) : (
      <div className="flex min-h-0 flex-1">
        <ul className="w-64 shrink-0 space-y-1 overflow-y-auto border-r border-hairline px-3 pb-3">
          {runs.map((run) => (
            <li key={run.flowRunId}>
              <Card
                interactive
                padding="none"
                className={cn(
                  TONE_FRAME[HISTORY_TONE[run.tone]],
                  // R7: the picked run wears the selected fill.
                  run.flowRunId === selectedRunId && ROW_CARD_PICKED_CLASS,
                )}
              >
                <CardAction
                  aria-pressed={run.flowRunId === selectedRunId}
                  onClick={() => onSelectRun(run.flowRunId)}
                  className={ROW_CARD_DOOR_CLASS}
                >
                  <span className="text-xs">
                    {run.timeLabel}
                    {run.startingStation ? ` · ${run.startingStation}` : ''}
                  </span>
                  <span
                    className={cn('text-3xs', toneInk[HISTORY_TONE[run.tone]])}
                  >
                    {run.statusLine}
                  </span>
                  <span className="text-3xs">{run.activityLine}</span>
                </CardAction>
              </Card>
            </li>
          ))}

          {/* Live events refresh the first page; older pages are loaded
              explicitly so scrolling alone never starts another read. */}
          {hasMore ? (
            <li className="pt-1">
              <FormError className="px-3">{olderError}</FormError>
              <Button
                type="button"
                variant="ghost"
                disabled={loadingOlder}
                onClick={onLoadOlder}
                size="sm"
                className="w-full px-3 text-2xs text-ink-muted"
              >
                {loadingOlder
                  ? 'Loading older runs…'
                  : olderError
                    ? 'Retry older runs'
                    : 'Load older runs'}
              </Button>
            </li>
          ) : null}

          {unattributedCalls.length > 0 ? (
            <li className="pt-2">
              {/* A station with no outgoing wire has no hop to attribute a
                  row to, so its call belongs to no run — and saying so is the
                  only honest place to put it. */}
              <SectionLabel className="px-1 pb-1">
                Calls without a run
              </SectionLabel>
              <ul className="space-y-1">
                {unattributedCalls.map((call) => (
                  <HistoryEventRowView
                    key={call.id}
                    event={call}
                    selected={call.id === selectedEventId}
                    onSelect={() => onSelectEvent(call.id)}
                  />
                ))}
              </ul>
            </li>
          ) : null}
        </ul>

        <div className="min-w-0 flex-1 space-y-2 overflow-y-auto px-4 pb-3">
          {summary ? <p className="text-xs text-ink-muted">{summary}</p> : null}

          {laps.map((lap) => (
            <div key={lap.lap} className="space-y-1">
              {/* Only when the run went round more than once: a single-lap
                  run with a "Lap 1" header would invent a ceremony. */}
              {laps.length > 1 ? (
                <p className="text-2xs font-medium">
                  {lap.label} ·{' '}
                  {lap.deliveries === 1
                    ? '1 delivery'
                    : `${lap.deliveries} deliveries`}
                </p>
              ) : null}
              <ul className="space-y-1">
                {lap.events.map((event) => (
                  <HistoryEventRowView
                    key={event.id}
                    event={event}
                    selected={event.id === selectedEventId}
                    onSelect={() => onSelectEvent(event.id)}
                  />
                ))}
              </ul>
            </div>
          ))}

          {calls.length > 0 ? (
            <ul className="space-y-1">
              {calls.map((call) => (
                <HistoryEventRowView
                  key={call.id}
                  event={call}
                  selected={call.id === selectedEventId}
                  onSelect={() => onSelectEvent(call.id)}
                />
              ))}
            </ul>
          ) : null}

          {selectedRunId ? (
            <p className="pt-1 text-3xs text-ink-muted">
              No later events recorded for this run.
            </p>
          ) : (
            <p className="text-2xs text-ink-muted">
              Pick a run to see what happened in it.
            </p>
          )}
        </div>
      </div>
    )}
  </section>
)
