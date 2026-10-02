import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { CrewDecorationPicker } from './crew-decoration-picker.presentational'
import { crewTokens } from '@convergence/ui'

const meta = {
  title: 'Features/MissionControl/CrewDecorationPicker',
  component: CrewDecorationPicker,
  args: {
    emoji: null,
    accentColor: null,
    onEmojiChange: fn(),
    onAccentColorChange: fn(),
  },
} satisfies Meta<typeof CrewDecorationPicker>

export default meta

type Story = StoryObj<typeof meta>

/** A plain crew: nothing pressed, and no "no accent" control to offer. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const emoji = canvas.getByRole('group', { name: 'Crew emoji' })
    await userEvent.click(
      within(emoji).getByRole('button', { name: 'Emoji 🐎' }),
    )
    await expect(args.onEmojiChange).toHaveBeenCalledWith('🐎')
    const accent = canvas.getByRole('group', { name: 'Crew accent color' })
    await userEvent.click(
      within(accent).getByRole('button', { name: 'Violet' }),
    )
    await expect(args.onAccentColorChange).toHaveBeenCalledWith(
      crewTokens.violet,
    )
    await expect(
      canvas.queryByRole('button', { name: 'No accent color' }),
    ).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * A decorated crew: the choices are pressed, picking one again clears it,
 * and the accent can be taken off outright.
 */
export const Busy: Story = {
  args: { emoji: '🛰️', accentColor: crewTokens.blue },
  play: async ({ args, canvas, userEvent }) => {
    const satellite = canvas.getByRole('button', { name: 'Emoji 🛰️' })
    await expect(satellite).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(satellite)
    await expect(args.onEmojiChange).toHaveBeenCalledWith(null)
    await expect(canvas.getByRole('button', { name: 'Blue' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'No accent color' }),
    )
    await expect(args.onAccentColorChange).toHaveBeenCalledWith(null)
  },
}
