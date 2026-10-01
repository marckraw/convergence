import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { SessionIntentDialog } from './session-intent-dialog.presentational'

const meta = {
  title: 'Features/SessionIntentDialog/SessionIntentDialog',
  component: SessionIntentDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    onSelectConversation: fn(),
    onSelectTerminal: fn(),
  },
} satisfies Meta<typeof SessionIntentDialog>

export default meta

type Story = StoryObj<typeof meta>

/** Two choices, each a button that says what it starts. */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', { name: 'New session' })
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    )
    await expect(dialog).toHaveAccessibleDescription(
      'Pick how you want this session to run.',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Conversation/ }),
    )
    await expect(args.onSelectConversation).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Terminal/ }),
    )
    await expect(args.onSelectTerminal).toHaveBeenCalledOnce()
  },
}

/** The ✕ and Escape ask to close it; nothing is started. */
export const Dismiss: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', { name: 'New session' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
    await userEvent.keyboard('{Escape}')
    await expect(args.onOpenChange).toHaveBeenCalledTimes(2)
    await expect(args.onSelectConversation).not.toHaveBeenCalled()
    await expect(args.onSelectTerminal).not.toHaveBeenCalled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Reduced motion: the dialog arrives at once. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'New session' })
    await expect(getComputedStyle(dialog).animationName).toBe('none')
  },
}
