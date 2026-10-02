import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import type { RelayHop } from '@/entities/session-relay'
import { RelayHopRow } from './relay-hop-row.presentational'
import { buildRelayHopLine } from './relay-hop.pure'

/** The trail's clock, fixed: every row's time is an age measured against it. */
const NOW = new Date('2026-09-17T12:10:00.000Z')

const hop = (overrides: Partial<RelayHop> = {}): RelayHop => ({
  settleId: null,
  id: 'hop-1',
  relayId: 'relay-1',
  crewId: 'crew-1',
  flowRunId: 'run-1',
  firedAt: '2026-09-17T12:06:00.000Z',
  sourceSessionId: 'fable',
  targetSessionId: 'opus',
  spawnedSessionId: null,
  triggerStatus: 'completed',
  payloadPreview: null,
  baton: null,
  roundNumber: null,
  lapNumber: null,
  settledAt: null,
  outcome: 'delivered',
  error: null,
  ...overrides,
})

const names: Record<string, string> = { fable: 'Fable', opus: 'opus-mac' }
const lineOf = (overrides: Partial<RelayHop> = {}) =>
  buildRelayHopLine(hop(overrides), (id) => names[id] ?? null, NOW)

const meta = {
  title: 'Features/MissionControl/RelayHopRow',
  component: RelayHopRow,
  args: {
    line: lineOf({
      baton: 'horse',
      roundNumber: 3,
      payloadPreview:
        'Implement the brief. Return your result and verification evidence.',
    }),
    now: NOW,
    expanded: false,
    onToggle: fn(),
  },
  decorators: [
    (Story) => (
      <ul className="w-96">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof RelayHopRow>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One line of the ledger: who to whom, the route and the round, then what the
 * wire did. The message it carried is folded behind its own control.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const row = canvas.getByRole('listitem')
    await expect(row).toHaveTextContent('Fable')
    await expect(row).toHaveTextContent('opus-mac')
    await expect(row).toHaveTextContent('round 3')
    // The time is a Timestamp: Timestamp's words, the instant in its <time> (MC-13).
    const time = row.querySelector('time') as HTMLTimeElement
    await expect(time).toHaveTextContent('4 minutes ago')
    await expect(time).toHaveAttribute('dateTime', '2026-09-17T12:06:00.000Z')
    const show = canvas.getByRole('button', {
      name: 'Show the message carried',
    })
    await expect(show).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(show)
    await expect(args.onToggle).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Opened: the message the hop carried, under the row. */
export const Long: Story = {
  args: { expanded: true },
  play: async ({ args, canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Hide the message carried' }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText(args.line.payloadPreview!)).toBeVisible()
  },
}

/**
 * Read only: with no onToggle (the wire popover's glance), a hop that
 * carried a message offers no fold for it (MC N4).
 */
export const ReadOnly: Story = {
  name: 'Read only',
  args: { onToggle: undefined },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole('listitem')).toHaveTextContent('round 3')
    await expect(canvas.queryByRole('button')).toBeNull()
    await expect(
      canvas.queryByText(args.line.payloadPreview!),
    ).not.toBeInTheDocument()
  },
}

/** A delivery that failed says why on the row itself, never behind a click. */
export const Failed: Story = {
  args: {
    line: lineOf({
      outcome: 'error',
      error: 'opus-mac did not accept the message: the conversation is gone',
    }),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        'opus-mac did not accept the message: the conversation is gone',
      ),
    ).toBeVisible()
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

export const FailedDark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}

/** The wire held by design: a grey row with its reason, nothing to open. */
export const Empty: Story = {
  args: { line: lineOf({ outcome: 'skipped-baton', baton: 'review' }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('listitem')).toHaveTextContent('review')
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}
