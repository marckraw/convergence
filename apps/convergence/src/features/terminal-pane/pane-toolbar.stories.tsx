import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { PaneToolbar } from './pane-toolbar.presentational'

const meta = {
  title: 'Features/TerminalPane/PaneToolbar',
  component: PaneToolbar,
  args: {
    onSplitHorizontal: fn(),
    onSplitVertical: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof PaneToolbar>

export default meta

type Story = StoryObj<typeof meta>

/** Three icon buttons, each named for what it does. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Split horizontal' }),
    )
    await expect(args.onSplitHorizontal).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Split vertical' }),
    )
    await expect(args.onSplitVertical).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Close tab' }))
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

/** The close button takes the name its owner gives it. */
export const ClosePane: Story = {
  args: { closeLabel: 'Close pane' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Close pane' }),
    ).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Close tab' })).toBeNull()
  },
}

/**
 * Without a close: where each tab carries its own ✕ (the terminal dock's
 * strip), the toolbar only splits, so no tab has two closes.
 */
export const WithoutClose: Story = {
  name: 'Without close',
  args: { onClose: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('button')).toHaveLength(2)
    await expect(canvas.queryByRole('button', { name: 'Close tab' })).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
