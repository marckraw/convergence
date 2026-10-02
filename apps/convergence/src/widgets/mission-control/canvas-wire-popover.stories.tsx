import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ComponentProps, useState } from 'react'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
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

/**
 * The popover as the canvas holds it: open until it asks to close, then gone,
 * as the canvas drops the wire it had open.
 */
function OpenWire(props: ComponentProps<typeof CanvasWirePopover>) {
  const [open, setOpen] = useState(true)
  return open ? (
    <CanvasWirePopover
      {...props}
      at={{ x: 24, y: 24 }}
      onClose={() => {
        props.onClose()
        setOpen(false)
      }}
    />
  ) : (
    <p className="text-xs text-ink-muted">Closed</p>
  )
}

/** The popup has arrived: open, and done growing in. */
const arrivedPopover = async (name?: string) => {
  const popover = await screen.findByRole('dialog', name ? { name } : {})
  await waitFor(() => expect(popover).toBeVisible())
  return popover
}

const meta = {
  title: 'Widgets/MissionControl/CanvasWirePopover',
  component: CanvasWirePopover,
  render: (args) => <OpenWire {...args} />,
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
 * read-only. The popover is named by the sentence, and it is a real popover
 * (MC-5): the focus moves into it, and its ✕ closes it.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const popover = await arrivedPopover(args.sentence.text)
    await waitFor(() =>
      expect(popover.contains(document.activeElement)).toBe(true),
    )
    await expect(within(popover).getAllByRole('listitem')).toHaveLength(2)
    await expect(
      within(popover).getByText(
        'opus-mac did not accept the message: the turn was still running',
      ),
    ).toBeVisible()
    // Read, never expanded: the crew's own trail opens a payload.
    await expect(
      within(popover).queryByRole('button', { name: /message carried/ }),
    ).toBeNull()
    await userEvent.click(
      within(popover).getByRole('button', { name: 'Close wire details' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
    await expect(await canvas.findByText('Closed')).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Escape closes it, as every popover does (MC-5). */
export const Escape: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const popover = await arrivedPopover(args.sentence.text)
    await waitFor(() =>
      expect(popover.contains(document.activeElement)).toBe(true),
    )
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalledOnce()
    await expect(await canvas.findByText('Closed')).toBeVisible()
  },
}

/** A wire that is off and has never fired. */
export const Empty: Story = {
  args: { armed: false, hopLines: [] },
  play: async () => {
    const popover = await arrivedPopover()
    await expect(
      within(popover).getByText('This wire has not fired yet.'),
    ).toBeVisible()
    await expect(within(popover).queryByRole('list')).toBeNull()
  },
}
