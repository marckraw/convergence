import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { PaneToolbar } from './pane-toolbar.presentational'

const meta = {
  title: 'Features/TerminalPane/PaneToolbar',
  component: PaneToolbar,
  args: {
    onSplitHorizontal: fn(),
    onSplitVertical: fn(),
  },
} satisfies Meta<typeof PaneToolbar>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Two icon buttons, each named for what it does. No close: each tab carries
 * its own ✕ (the terminal dock's strip), so no tab has two (NAV N4).
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getAllByRole('button')).toHaveLength(2)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Split horizontal' }),
    )
    await expect(args.onSplitHorizontal).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Split vertical' }),
    )
    await expect(args.onSplitVertical).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Each button's tooltip says the key that does the same (NAV-23). */
export const Shortcuts: Story = {
  args: {
    shortcuts: {
      'new-tab': '⌘T',
      'split-vertical': '⌘D',
      'split-horizontal': '⌘⇧D',
      'close-tab': '⌘W',
      'toggle-dock': '⌘`',
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Split horizontal' }),
    ).toHaveAttribute('data-tooltip-shortcut', '⌘⇧D')
    await expect(
      canvas.getByRole('button', { name: 'Split vertical' }),
    ).toHaveAttribute('data-tooltip-shortcut', '⌘D')
  },
}
