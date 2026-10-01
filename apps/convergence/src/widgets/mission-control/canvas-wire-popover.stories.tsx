import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import type { RelayHop } from '@/entities/session-relay'
import {
  buildRelayHopLine,
  buildRelaySentence,
} from '@/features/mission-control'
import { CanvasWirePopover } from './canvas-wire-popover.presentational'

/** The trail's clock, fixed: every row's time is an age measured against it. */
const NOW = new Date('2026-09-17T12:10:00.000Z')

const hop = (overrides: Partial<RelayHop>): RelayHop => ({
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
  baton: 'horse',
  roundNumber: 2,
  lapNumber: null,
  settledAt: null,
  outcome: 'delivered',
  error: null,
  ...overrides,
})

const names: Record<string, string> = { fable: 'Fable', opus: 'opus-mac' }
const lineOf = (overrides: Partial<RelayHop>) =>
  buildRelayHopLine(hop(overrides), (id) => names[id] ?? null, NOW)

const meta = {
  title: 'Widgets/MissionControl/CanvasWirePopover',
  component: CanvasWirePopover,
  args: {
    sentence: buildRelaySentence(
      {
        trigger: 'settled',
        sourceSessionId: 'fable',
        targetSessionId: 'opus',
        action: 'hail',
        spawnSpec: null,
        instruction: 'Implement the brief.',
        opener: null,
        conditionToken: 'BATON: horse',
      },
      (id) => names[id] ?? null,
    ),
    armed: true,
    hopLines: [
      lineOf({ id: 'hop-2', firedAt: '2026-09-17T12:08:00.000Z' }),
      lineOf({
        id: 'hop-1',
        outcome: 'error',
        error:
          'opus-mac did not accept the message: the turn was still running',
      }),
    ],
    onClose: fn(),
  },
} satisfies Meta<typeof CanvasWirePopover>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One wire, opened: its sentence, whether it is on, and its recent hops,
 * read-only. The popover is named by the sentence.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const popover = canvas.getByRole('dialog', { name: args.sentence.text })
    await expect(popover).toBeVisible()
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2)
    await expect(
      canvas.getByText(
        'opus-mac did not accept the message: the turn was still running',
      ),
    ).toBeVisible()
    // Read, never expanded: the crew's own trail opens a payload.
    await expect(
      canvas.queryByRole('button', { name: /message carried/ }),
    ).toBeNull()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Close wire details' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A wire that is off and has never fired. */
export const Empty: Story = {
  args: { armed: false, hopLines: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('This wire has not fired yet.')).toBeVisible()
    await expect(canvas.queryByRole('list')).toBeNull()
  },
}
