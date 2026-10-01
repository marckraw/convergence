import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { HistoryEventInspector } from './history-event-inspector.presentational'

const meta = {
  title: 'Features/MissionControl/HistoryEventInspector',
  component: HistoryEventInspector,
  args: {
    title: 'Fable → opus-mac',
    tone: 'delivered',
    facts: {
      source: 'Fable',
      recipient: 'opus-mac',
      baton: 'horse',
      outcome: 'Delivered',
      timestamp: '2026-09-17T12:06:00.000Z',
      responsePreview:
        'Implemented the brief; typecheck, unit and story gates green. PR #905 open.',
      message: null,
    },
    isCall: false,
    acknowledged: false,
    earlierCallCount: 0,
    openRecipientLabel: 'opus-mac',
    hasCurrentConnection: true,
    busy: false,
    onOpenRecipient: fn(),
    onViewCurrentConnection: fn(),
    onMarkSeen: fn(),
    onClose: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex h-160 w-80 flex-col">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HistoryEventInspector>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One recorded event: the facts as written down when it happened, then the
 * conversation it reached and, separately, the connection as it is now.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const panel = canvas.getByRole('region', { name: 'Recorded event' })
    await expect(panel).toHaveTextContent('Baton')
    await expect(panel).toHaveTextContent('horse')
    await expect(canvas.getByText(args.facts.responsePreview!)).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Open opus-mac conversation' }),
    )
    await expect(args.onOpenRecipient).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'View current connection' }),
    )
    await expect(args.onViewCurrentConnection).toHaveBeenCalledOnce()
    await expect(canvas.queryByRole('button', { name: 'Mark seen' })).toBeNull()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Close the event panel' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

const call = {
  title: 'Fable asked for Marcin',
  tone: 'held' as const,
  isCall: true,
  earlierCallCount: 2,
  openRecipientLabel: null,
  hasCurrentConnection: false,
  facts: {
    source: 'Fable',
    recipient: 'Marcin',
    baton: null,
    outcome: 'Held',
    timestamp: '2026-09-17T12:08:00.000Z',
    responsePreview: null,
    message:
      'Two laps in and the reviewer still wants the **lap cap** discussed. Your call.',
  },
}

/**
 * A call on the chair: its message, earlier calls counted, and Mark seen,
 * which acknowledges and nothing else.
 */
export const Busy: Story = {
  args: call,
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('none declared')).toBeVisible()
    await expect(
      canvas.getByText('No response preview was recorded.'),
    ).toBeVisible()
    await expect(canvas.getByText(/Earlier calls · 2/)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Mark seen' }))
    await expect(args.onMarkSeen).toHaveBeenCalledOnce()
  },
}

/** Already seen: the button says so and cannot be pressed again. */
export const Disabled: Story = {
  args: { ...call, acknowledged: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Seen' })).toBeDisabled()
  },
}

/** A failed delivery, recorded in the alarm tone. */
export const Failed: Story = {
  args: {
    tone: 'alarm',
    hasCurrentConnection: false,
    facts: {
      source: 'Fable',
      recipient: 'a conversation that is gone',
      baton: 'horse',
      outcome: 'Delivery failed',
      timestamp: '2026-09-17T12:06:00.000Z',
      responsePreview: null,
      message: null,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Fable → opus-mac' }),
    ).toBeVisible()
    await expect(canvas.getByText('Delivery failed')).toBeVisible()
    await expect(
      canvas.queryByRole('button', { name: 'View current connection' }),
    ).toBeNull()
  },
}
