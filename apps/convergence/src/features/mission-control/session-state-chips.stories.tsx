import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { SessionStateChips } from './session-state-chips.presentational'

const meta = {
  title: 'Features/MissionControl/SessionStateChips',
  component: SessionStateChips,
  args: {
    selected: [],
    counts: {
      working: 3,
      'needs-you': 2,
      idle: 5,
      finished: 4,
      failed: 1,
      'host-unreachable': 0,
    },
    onToggle: fn(),
    onClear: fn(),
  },
} satisfies Meta<typeof SessionStateChips>

export default meta

type Story = StoryObj<typeof meta>

/** Nothing picked means the whole room: every chip off, no Clear. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const working = canvas.getByRole('button', { name: 'Working 3' })
    await expect(working).toHaveAttribute('aria-pressed', 'false')
    await expect(canvas.queryByRole('button', { name: 'Clear' })).toBeNull()
    await userEvent.click(working)
    await expect(args.onToggle).toHaveBeenCalledWith('working')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Two states picked: those chips are pressed, and Clear gives the room back. */
export const Busy: Story = {
  args: { selected: ['needs-you', 'failed'] },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('button', { name: 'Needs you 2' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      canvas.getByRole('button', { name: 'Failed 1' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Clear' }))
    await expect(args.onClear).toHaveBeenCalledOnce()
  },
}

/** A state with no cards stays a chip, still pressable. */
export const Empty: Story = {
  args: {
    counts: {
      working: 0,
      'needs-you': 0,
      idle: 0,
      finished: 0,
      failed: 0,
      'host-unreachable': 0,
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Host unreachable 0' }),
    )
    await expect(args.onToggle).toHaveBeenCalledWith('host-unreachable')
  },
}
