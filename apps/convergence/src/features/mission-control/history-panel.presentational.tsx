import type { FC } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import {
  HISTORY_TONE_BORDER,
  HISTORY_TONE_TEXT,
  HistoryEventRowView,
} from './history-event-row.presentational'
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
  onFilterChange,
  onSelectRun,
  onSelectEvent,
  onRetry,
  onClose,
}) => (
  <section
    data-history-panel
    aria-label="History"
    className="flex h-[46%] min-h-0 shrink-0 flex-col border-t border-white/10"
  >
    <div className="flex items-center gap-3 px-5 py-2">
      <h3 className="text-sm font-medium">History</h3>
      <p className="text-[11px] text-muted-foreground">{crewName}</p>

      <div
        role="group"
        aria-label="Which runs to show"
        className="ml-auto flex items-center gap-0.5 rounded-full border border-white/10 p-0.5"
      >
        {HISTORY_FILTERS.map((entry) => (
          <Button
            key={entry.value}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={filter === entry.value}
            onClick={() => onFilterChange(entry.value)}
            className={cn(
              'h-6 rounded-full px-2.5 text-[11px] font-normal',
              filter === entry.value
                ? 'bg-white/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {entry.label}
          </Button>
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Close history"
        onClick={onClose}
        className="h-7 px-2 text-[11px]"
      >
        <X className="size-3.5" />
        Close
      </Button>
    </div>

    {/* Four states, and they are four sentences (promise 7). */}
    {state === 'loading' ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        <p className="text-[12px]">Loading history…</p>
        <p className="text-[11px] text-muted-foreground">
          Keep the selected run while records load.
        </p>
      </div>
    ) : state === 'error' ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-[12px] text-red-400">Couldn’t load history</p>
        <p className="text-[11px] text-muted-foreground">
          {loadError ?? 'Try loading this crew’s history again.'}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRetry}
          className="h-7 px-3 text-[11px]"
        >
          Try again
        </Button>
        <p className="text-[10px] text-muted-foreground/70">
          Reloads records only. Does not retry a delivery.
        </p>
      </div>
    ) : state === 'empty' ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        <p className="text-[12px]">No history available yet</p>
        <p className="max-w-sm text-[11px] text-muted-foreground">
          There are no recorded events for this crew. Activity will appear here
          when a connection is evaluated.
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          No records does not imply this crew has never run.
        </p>
      </div>
    ) : state === 'no-match' ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-[12px]">No matching events</p>
        <p className="text-[11px] text-muted-foreground">
          There are recorded events, but none match these filters.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onFilterChange('all')}
          className="h-7 px-3 text-[11px]"
        >
          Clear history filters
        </Button>
        <p className="text-[10px] text-muted-foreground/70">
          Filters change the view, not the record.
        </p>
      </div>
    ) : (
      <div className="flex min-h-0 flex-1">
        <ul className="w-64 shrink-0 space-y-1 overflow-y-auto border-r border-white/10 px-3 pb-3">
          {runs.map((run) => (
            <li key={run.flowRunId}>
              <Button
                type="button"
                variant="ghost"
                aria-pressed={run.flowRunId === selectedRunId}
                onClick={() => onSelectRun(run.flowRunId)}
                className={cn(
                  'flex h-auto w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left font-normal',
                  HISTORY_TONE_BORDER[run.tone],
                  run.flowRunId === selectedRunId && 'bg-white/[0.06]',
                )}
              >
                <span className="text-[12px]">
                  {run.timeLabel}
                  {run.startingStation ? ` · ${run.startingStation}` : ''}
                </span>
                <span
                  className={cn('text-[10px]', HISTORY_TONE_TEXT[run.tone])}
                >
                  {run.statusLine}
                </span>
              </Button>
            </li>
          ))}

          {unattributedCalls.length > 0 ? (
            <li className="pt-2">
              {/* A station with no outgoing wire has no hop to attribute a
                  row to, so its call belongs to no run — and saying so is the
                  only honest place to put it. */}
              <p className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Calls without a run
              </p>
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
          {summary ? (
            <p className="text-[12px] text-muted-foreground">{summary}</p>
          ) : null}

          {laps.map((lap) => (
            <div key={lap.lap} className="space-y-1">
              {/* Only when the run went round more than once: a single-lap
                  run with a "Lap 1" header would invent a ceremony. */}
              {laps.length > 1 ? (
                <p className="text-[11px] font-medium">
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
            <p className="pt-1 text-[10px] text-muted-foreground/70">
              No later events recorded for this run.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Pick a run to see what happened in it.
            </p>
          )}
        </div>
      </div>
    )}
  </section>
)
