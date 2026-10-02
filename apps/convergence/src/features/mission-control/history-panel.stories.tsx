import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { HistoryPanel } from './history-panel.presentational'
import type {
  HistoryEventRow,
  HistoryLapGroup,
  HistoryRunRow,
} from './run-history.pure'

const runs: HistoryRunRow[] = [
  {
    flowRunId: 'run-2',
    timeLabel: '14:32',
    lastActivityLabel: '2m ago',
    debt: null,
    activityLine: 'last activity 2m ago',
    startingStation: 'Fable',
    statusLine: 'Handed back · 2 laps · 5 deliveries',
    tone: 'terminal',
    needsYou: true,
  },
  {
    flowRunId: 'run-1',
    timeLabel: 'Yesterday · 17:46',
    lastActivityLabel: 'yesterday',
    debt: null,
    activityLine: 'last activity yesterday',
    startingStation: 'Fable',
    statusLine: 'Finished · 1 lap · 2 deliveries',
    tone: 'delivered',
    needsYou: false,
  },
]

const event = (
  id: string,
  title: string,
  overrides: Partial<HistoryEventRow> = {},
): HistoryEventRow => ({
  id,
  kind: 'hop',
  timeLabel: '14:32',
  title,
  outcome: 'delivered',
  outcomeLabel: 'Delivered',
  tone: 'delivered',
  reason: null,
  relayId: 'relay-1',
  ...overrides,
})

const laps: HistoryLapGroup[] = [
  {
    lap: 1,
    label: 'Lap 1 · horse',
    deliveries: 2,
    events: [
      event('hop-1', 'Fable → opus-mac'),
      event('hop-2', 'opus-mac → Fable', { timeLabel: '14:40' }),
    ],
  },
  {
    lap: 2,
    label: 'Lap 2 · horse',
    deliveries: 1,
    events: [
      event('hop-3', 'Fable → opus-mac', {
        timeLabel: '14:52',
        outcome: 'handed-back',
        outcomeLabel: 'Handed back',
        tone: 'terminal',
        reason: 'The lap cap of 2 was reached; the next move is yours.',
      }),
    ],
  },
]

const calls: HistoryEventRow[] = [
  event('hail-1', 'Fable asked for Marcin', {
    kind: 'hail',
    timeLabel: '14:53',
    outcome: 'held',
    outcomeLabel: 'Held',
    tone: 'held',
    relayId: null,
    preview: 'Two laps in and the reviewer still wants the cap discussed.',
  }),
]

const meta = {
  title: 'Features/MissionControl/HistoryPanel',
  component: HistoryPanel,
  args: {
    crewName: 'convergence development',
    state: 'ready',
    runs,
    selectedRunId: 'run-2',
    summary: 'One run · 2 laps · 3 deliveries',
    laps,
    calls,
    unattributedCalls: [],
    selectedEventId: 'hop-3',
    filter: 'all',
    loadError: null,
    hasMore: true,
    loadingOlder: false,
    olderError: null,
    onLoadOlder: fn(),
    onFilterChange: fn(),
    onSelectRun: fn(),
    onSelectEvent: fn(),
    onRetry: fn(),
    onClose: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex h-225 w-240 flex-col">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof HistoryPanel>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Runs on the left, the chosen run's laps and calls on the right; every
 * reason is on its row. Filters change the view, never the record.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const panel = canvas.getByRole('region', { name: 'History' })
    // One filter of a few: a segmented radio group (MC-7).
    const filters = within(panel).getByRole('radiogroup', {
      name: 'Which runs to show',
    })
    await expect(
      within(filters).getByRole('radio', { name: 'All runs' }),
    ).toBeChecked()
    await userEvent.click(
      within(filters).getByRole('radio', { name: 'Handed back' }),
    )
    await expect(args.onFilterChange).toHaveBeenCalledWith('handed-back')
    const selectedRun = canvas.getByRole('button', { name: /^14:32 · Fable/ })
    // R7: the picked run is the selected row, aria-current on its door.
    await expect(selectedRun).toHaveAttribute('aria-current', 'true')
    await expect(selectedRun).not.toHaveAttribute('aria-pressed')
    await userEvent.click(canvas.getByRole('button', { name: /^Yesterday/ }))
    await expect(args.onSelectRun).toHaveBeenCalledWith('run-1')
    await expect(
      canvas.getByText('The lap cap of 2 was reached; the next move is yours.'),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: /Fable asked for Marcin/ }),
    )
    await expect(args.onSelectEvent).toHaveBeenCalledWith('hail-1')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Load older runs' }),
    )
    await expect(args.onLoadOlder).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Close history' }))
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Loading: the selected run is kept while records load. */
export const Busy: Story = {
  args: { state: 'loading' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Loading history…')).toBeVisible()
  },
}

/** The read failed: Try again reloads records, and says it retries nothing. */
export const Failed: Story = {
  args: { state: 'error', loadError: 'The history read timed out.' },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Couldn’t load history')).toBeVisible()
    await expect(canvas.getByText('The history read timed out.')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await expect(args.onRetry).toHaveBeenCalledOnce()
    await expect(
      canvas.getByText('Reloads records only. Does not retry a delivery.'),
    ).toBeVisible()
  },
}

export const FailedDark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}

/** Nothing recorded yet, which is not the same as never having run. */
export const Empty: Story = {
  args: { state: 'empty' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No history available yet')).toBeVisible()
  },
}

/** Records exist, but none match: one control clears the filter. */
export const NoMatch: Story = {
  args: { state: 'no-match', filter: 'failed' },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Clear history filters' }),
    )
    await expect(args.onFilterChange).toHaveBeenCalledWith('all')
  },
}

/**
 * Older runs failed to load, and a call belongs to no run: both said where
 * they happen, and the older-runs control offers to retry.
 */
export const Long: Story = {
  args: {
    olderError: 'Older runs could not be read.',
    selectedRunId: null,
    summary: null,
    laps: [],
    calls: [],
    unattributedCalls: calls,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Older runs could not be read.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Retry older runs' }),
    ).toBeVisible()
    await expect(canvas.getByText('Calls without a run')).toBeVisible()
    await expect(
      canvas.getByText('Pick a run to see what happened in it.'),
    ).toBeVisible()
  },
}
