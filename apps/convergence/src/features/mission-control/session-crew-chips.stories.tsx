import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { SessionCrewChips } from './session-crew-chips.presentational'
import { crewTokens } from '@convergence/ui'

const meta = {
  title: 'Features/MissionControl/SessionCrewChips',
  component: SessionCrewChips,
  args: {
    options: [
      {
        id: 'crew-1',
        label: 'convergence development',
        count: 4,
        emoji: '🐎',
        accentColor: crewTokens.violet,
      },
      {
        id: 'crew-2',
        label: 'backpack studio',
        count: 2,
        emoji: null,
        accentColor: crewTokens.green,
      },
      {
        id: 'crew-3',
        label: 'spikes',
        count: 0,
        emoji: null,
        accentColor: null,
      },
    ],
    selected: [],
    onToggle: fn(),
  },
} satisfies Meta<typeof SessionCrewChips>

export default meta

type Story = StoryObj<typeof meta>

/** A chip per crew, in its accent; pressing one narrows the room to it. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const crew = canvas.getByRole('button', {
      name: /convergence development 4/,
    })
    await expect(crew).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(crew)
    await expect(args.onToggle).toHaveBeenCalledWith('crew-1')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** One crew picked: pressed; the row's one "Clear filters" gives the room back (MC-7). */
export const Busy: Story = {
  args: { selected: ['crew-2'] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: /backpack studio 2/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.queryByRole('button', { name: /clear/i })).toBeNull()
  },
}

/** A long crew name is cut short inside its chip. */
export const Long: Story = {
  args: {
    options: [
      {
        id: 'crew-1',
        label:
          'convergence development — the Loom wave and everything after it',
        count: 12,
        emoji: '🛰️',
        accentColor: crewTokens.blue,
      },
    ],
  },
  play: async ({ canvas }) => {
    const chip = canvas.getByRole('button', { name: /the Loom wave/ })
    await expect(chip.getBoundingClientRect().width).toBeLessThanOrEqual(176)
  },
}

/** No crews: the row draws nothing. */
export const Empty: Story = {
  args: { options: [] },
  play: async ({ canvas }) => {
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
  },
}
