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

/**
 * A plain crew: each row is a radio group of swatches (R9), "none" chosen in
 * both, and a pick reports the choice.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const emoji = canvas.getByRole('radiogroup', { name: 'Crew emoji' })
    await expect(
      within(emoji).getByRole('radio', { name: 'No emoji' }),
    ).toBeChecked()
    await userEvent.click(
      within(emoji).getByRole('radio', { name: 'Emoji 🐎' }),
    )
    await expect(args.onEmojiChange).toHaveBeenCalledWith('🐎')
    const accent = canvas.getByRole('radiogroup', {
      name: 'Crew accent color',
    })
    await expect(
      within(accent).getByRole('radio', { name: 'No accent color' }),
    ).toBeChecked()
    await userEvent.click(within(accent).getByRole('radio', { name: 'Violet' }))
    await expect(args.onAccentColorChange).toHaveBeenCalledWith(
      crewTokens.violet,
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * A decorated crew: its choices are checked, in R7's chosen look (the raised
 * chip, never a ring or a scale: ruling 11), and "none" takes them off.
 */
export const Busy: Story = {
  args: { emoji: '🛰️', accentColor: crewTokens.blue },
  play: async ({ args, canvas, userEvent }) => {
    const satellite = canvas.getByRole('radio', { name: 'Emoji 🛰️' })
    await expect(satellite).toBeChecked()
    await expect(getComputedStyle(satellite).boxShadow).not.toBe('none')
    await userEvent.click(canvas.getByRole('radio', { name: 'No emoji' }))
    await expect(args.onEmojiChange).toHaveBeenCalledWith(null)
    const blue = canvas.getByRole('radio', { name: 'Blue' })
    await expect(blue).toBeChecked()
    await expect(getComputedStyle(blue).transform).toBe('none')
    await userEvent.click(
      canvas.getByRole('radio', { name: 'No accent color' }),
    )
    await expect(args.onAccentColorChange).toHaveBeenCalledWith(null)
  },
}

export const BusyDark: Story = {
  ...Busy,
  globals: { theme: 'dark' },
}
