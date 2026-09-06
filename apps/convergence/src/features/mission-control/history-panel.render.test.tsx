import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HistoryPanel } from './history-panel.presentational'
import { HistoryEventInspector } from './history-event-inspector.presentational'
import type {
  HistoryEventRow,
  HistoryLapGroup,
  HistoryPanelState,
  HistoryRunRow,
} from './run-history.pure'

/**
 * History, rendered (the MAR-2280 law).
 *
 * The pure tests prove the words are right. These prove the words reached the
 * screen — and, for the two promises that are really about restraint, that
 * the buttons beside them do only what they say.
 */
function event(overrides: Partial<HistoryEventRow> = {}): HistoryEventRow {
  return {
    id: 'h1',
    kind: 'hop',
    timeLabel: '14:32:10',
    title: 'Fable → Opus',
    outcome: 'delivered',
    outcomeLabel: 'Delivered',
    tone: 'delivered',
    reason: null,
    relayId: 'w1',
    ...overrides,
  }
}

function runRow(overrides: Partial<HistoryRunRow> = {}): HistoryRunRow {
  return {
    flowRunId: 'run-1',
    timeLabel: '14:32',
    startingStation: 'Fable',
    statusLine: '3 laps · handed back',
    tone: 'terminal',
    needsYou: false,
    ...overrides,
  }
}

function renderPanel(
  overrides: {
    state?: HistoryPanelState
    runs?: HistoryRunRow[]
    laps?: HistoryLapGroup[]
    calls?: HistoryEventRow[]
    unattributedCalls?: HistoryEventRow[]
    summary?: string | null
    hasMore?: boolean
  } = {},
) {
  const handlers = {
    onFilterChange: vi.fn(),
    onSelectRun: vi.fn(),
    onSelectEvent: vi.fn(),
    onLoadOlder: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
  }
  render(
    <HistoryPanel
      crewName="Convergence development"
      state={overrides.state ?? 'ready'}
      runs={overrides.runs ?? [runRow()]}
      selectedRunId="run-1"
      summary={overrides.summary ?? 'One run · 3 laps · 9 deliveries'}
      laps={overrides.laps ?? []}
      calls={overrides.calls ?? []}
      unattributedCalls={overrides.unattributedCalls ?? []}
      selectedEventId={null}
      filter="all"
      loadError={null}
      hasMore={overrides.hasMore ?? false}
      loadingOlder={false}
      {...handlers}
    />,
  )
  return handlers
}

describe('the history panel, rendered', () => {
  /**
   * THE lap canary on the screen: three correction cycles are ONE run row and
   * three lap groups with nine event rows.
   *
   * Mutation that reds it: render one run row per lap (flatten the groups
   * into the run list).
   */
  it('shows three laps as one run row and three lap groups', () => {
    const laps: HistoryLapGroup[] = [1, 2, 3].map((lap) => ({
      lap,
      label: `Lap ${lap} · horse`,
      deliveries: 3,
      events: [1, 2, 3].map((n) =>
        event({ id: `l${lap}e${n}`, title: `Fable → Opus ${n}` }),
      ),
    }))

    renderPanel({ laps })

    // ONE run row, not three: the whole point of laps is that three
    // correction cycles are one thing Marcin watches.
    expect(screen.getAllByText('3 laps · handed back')).toHaveLength(1)
    expect(screen.getAllByText(/^14:32 · Fable$/)).toHaveLength(1)
    // …three lap headers…
    expect(screen.getByText(/Lap 1 · horse/)).toBeInTheDocument()
    expect(screen.getByText(/Lap 2 · horse/)).toBeInTheDocument()
    expect(screen.getByText(/Lap 3 · horse/)).toBeInTheDocument()
    // …and nine deliveries.
    expect(screen.getAllByText('Delivered')).toHaveLength(9)
    expect(
      screen.getByText('One run · 3 laps · 9 deliveries'),
    ).toBeInTheDocument()
  })

  it('does not put a lap header on a run that only went round once', () => {
    renderPanel({
      laps: [
        { lap: 1, label: 'Lap 1 · horse', deliveries: 1, events: [event()] },
      ],
    })

    expect(screen.queryByText(/Lap 1 · horse/)).not.toBeInTheDocument()
    expect(screen.getByText('Delivered')).toBeInTheDocument()
  })

  /**
   * Promise 4: the reason is ON the row. Behind an expander it is a reason
   * most people never read.
   *
   * Mutation that reds it: render `event.reason` only for the selected row.
   */
  it('shows a delivery failure’s reason without anything being clicked', () => {
    renderPanel({
      laps: [
        {
          lap: 1,
          label: 'Lap 1',
          deliveries: 0,
          events: [
            event({
              outcome: 'delivery-failed',
              outcomeLabel: 'Delivery failed',
              tone: 'alarm',
              reason: 'Pi is unavailable. The response was not delivered.',
            }),
          ],
        },
      ],
      runs: [runRow({ statusLine: '1 delivery error', tone: 'alarm' })],
    })

    expect(screen.getByText('Delivery failed')).toBeInTheDocument()
    expect(
      screen.getByText('Pi is unavailable. The response was not delivered.'),
    ).toBeInTheDocument()
    expect(screen.getByText('1 delivery error')).toBeInTheDocument()
  })

  /**
   * THE four-states canary on the screen (promise 7). Each state is its own
   * sentence, and two of them carry the promise that reading history never
   * sends anything.
   *
   * Mutation that reds it: render the same empty component for `empty` and
   * `no-match`.
   */
  it('gives loading, error, no records and no matches four different faces', () => {
    const { unmount: a } = render(
      <HistoryPanel
        crewName="c"
        state="loading"
        runs={[]}
        selectedRunId={null}
        summary={null}
        laps={[]}
        calls={[]}
        unattributedCalls={[]}
        selectedEventId={null}
        filter="all"
        loadError={null}
        hasMore={false}
        loadingOlder={false}
        onLoadOlder={vi.fn()}
        onFilterChange={vi.fn()}
        onSelectRun={vi.fn()}
        onSelectEvent={vi.fn()}
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Loading history…')).toBeInTheDocument()
    a()

    renderPanel({ state: 'empty' })
    expect(screen.getByText('No history available yet')).toBeInTheDocument()
    expect(
      screen.getByText('No records does not imply this crew has never run.'),
    ).toBeInTheDocument()
    screen.getByText('No history available yet').closest('div')
    document.body.innerHTML = ''

    renderPanel({ state: 'no-match' })
    expect(screen.getByText('No matching events')).toBeInTheDocument()
    expect(
      screen.getByText('Filters change the view, not the record.'),
    ).toBeInTheDocument()
    document.body.innerHTML = ''

    renderPanel({ state: 'error' })
    expect(screen.getByText('Couldn’t load history')).toBeInTheDocument()
    // The fear this sentence exists to answer.
    expect(
      screen.getByText('Reloads records only. Does not retry a delivery.'),
    ).toBeInTheDocument()
  })

  it('keeps a call with no run out of every run, under its own heading', () => {
    renderPanel({
      unattributedCalls: [
        event({
          id: 'x1',
          kind: 'hail',
          title: 'Sol needs you',
          outcome: 'parked',
          outcomeLabel: 'Nobody answered',
          tone: 'alarm',
          relayId: null,
        }),
      ],
    })

    expect(screen.getByText('Calls without a run')).toBeInTheDocument()
    expect(screen.getByText('Sol needs you')).toBeInTheDocument()
  })
})

describe('the recorded-event panel, rendered', () => {
  function renderInspector(
    overrides: {
      isCall?: boolean
      acknowledged?: boolean
      responsePreview?: string | null
      message?: string | null
      hasCurrentConnection?: boolean
    } = {},
  ) {
    const handlers = {
      onOpenRecipient: vi.fn(),
      onViewCurrentConnection: vi.fn(),
      onMarkSeen: vi.fn(),
      onClose: vi.fn(),
    }
    render(
      <HistoryEventInspector
        title="Delivery failed"
        tone="alarm"
        facts={{
          source: 'Opus',
          recipient: 'Sol · reviewer',
          baton: 'reviewer',
          outcome: 'Delivery failed',
          timestamp: '6 September · 14:38:22',
          responsePreview: overrides.responsePreview ?? null,
          message: overrides.message ?? null,
        }}
        isCall={overrides.isCall ?? false}
        acknowledged={overrides.acknowledged ?? false}
        earlierCallCount={3}
        openRecipientLabel="Sol · reviewer"
        hasCurrentConnection={overrides.hasCurrentConnection ?? true}
        busy={false}
        {...handlers}
      />,
    )
    return handlers
  }

  it('shows the recorded facts, not the connection as it reads today', () => {
    renderInspector()

    expect(screen.getByText('Opus')).toBeInTheDocument()
    expect(screen.getByText('Sol · reviewer')).toBeInTheDocument()
    expect(screen.getByText('reviewer')).toBeInTheDocument()
    expect(
      screen.getByText('No response preview was recorded.'),
    ).toBeInTheDocument()
    // Promise 6: the current settings are a SEPARATE thing, offered as one.
    expect(
      screen.getByRole('button', { name: 'View current connection' }),
    ).toBeInTheDocument()
  })

  /**
   * Promise 5, and the sentence that carries it. **Mark seen acknowledges and
   * nothing else** — no reply, no restart, no approval — and the panel says
   * all three, because a button beside a message from an agent is exactly
   * where somebody would fear otherwise.
   *
   * Mutation that reds it: drop the sentence, or wire the button to anything
   * but acknowledgement (pinned at the container too).
   */
  it('says what Mark seen does not do, beside the button', () => {
    const handlers = renderInspector({
      isCall: true,
      message: 'Implementation reviewed. Two decisions need your eyes.',
    })

    expect(
      screen.getByText(
        'Implementation reviewed. Two decisions need your eyes.',
      ),
    ).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Mark seen' })
    expect(
      screen.getByText(
        'Mark seen acknowledges this call. It does not send a reply or restart the run.',
      ),
    ).toBeInTheDocument()

    fireEvent.click(button)
    expect(handlers.onMarkSeen).toHaveBeenCalledTimes(1)
    // Nothing else moved.
    expect(handlers.onOpenRecipient).not.toHaveBeenCalled()
    expect(handlers.onViewCurrentConnection).not.toHaveBeenCalled()
  })

  it('says a call is already seen rather than offering it again', () => {
    renderInspector({ isCall: true, acknowledged: true })

    expect(screen.getByRole('button', { name: 'Seen' })).toBeDisabled()
  })

  it('offers no acknowledgement for a delivery, which is not a call', () => {
    renderInspector({ isCall: false })

    expect(
      screen.queryByRole('button', { name: 'Mark seen' }),
    ).not.toBeInTheDocument()
  })

  it('says earlier calls stay in history', () => {
    renderInspector({ isCall: true })

    expect(screen.getByText(/Earlier calls · 3/)).toBeInTheDocument()
  })

  it('hides the current-connection link when the wire is gone', () => {
    renderInspector({ hasCurrentConnection: false })

    expect(
      screen.queryByRole('button', { name: 'View current connection' }),
    ).not.toBeInTheDocument()
    // The record itself is still fully readable.
    expect(screen.getByText('Opus')).toBeInTheDocument()
  })
})
