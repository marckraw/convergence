import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ThemeToggle } from './theme-toggle.presentational'

const meta = {
  title: 'Features/Theme toggle/Theme toggle',
  component: ThemeToggle,
  args: { theme: 'light', onToggle: fn() },
} satisfies Meta<typeof ThemeToggle>

export default meta

type Story = StoryObj<typeof meta>

/**
 * An icon button named for what it does, Change theme, with the theme that is
 * on under it (NAV-6); it moves to the next.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole('button', { name: 'Change theme' })
    await expect(toggle).toHaveAccessibleDescription('Now: Light')
    await userEvent.click(toggle)
    await expect(args.onToggle).toHaveBeenCalledOnce()
    // The keyboard reaches it too.
    await userEvent.tab()
    await userEvent.tab({ shift: true })
    await expect(toggle).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onToggle).toHaveBeenCalledTimes(2)
  },
}

export const Dark: Story = {
  args: { theme: 'dark' },
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Change theme' }),
    ).toHaveAccessibleDescription('Now: Dark')
  },
}

/** Following the system: its own glyph and name. */
export const System: Story = {
  args: { theme: 'system' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Change theme' }),
    ).toHaveAccessibleDescription('Now: System')
  },
}
