import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { RouteFallbackView } from './route-fallback.presentational'

const meta = {
  title: 'Widgets/App/Route fallback',
  component: RouteFallbackView,
  args: {
    fallback: {
      reason: 'session-not-found',
      title: 'This conversation is gone',
      message:
        'The link points at a conversation that no longer exists. It may have been deleted on another window.',
      action: 'chat-home',
      actionLabel: 'Go to chats',
    },
    onAction: fn(),
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-112 bg-canvas text-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RouteFallbackView>

export default meta

type Story = StoryObj<typeof meta>

/** A route that leads nowhere: what happened, and the one way back. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('heading', {
        level: 1,
        name: 'This conversation is gone',
      }),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Go to chats' }))
    await expect(args.onAction).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A long explanation wraps inside its column; the way back stays below it. */
export const Long: Story = {
  args: {
    fallback: {
      reason: 'worktree-removed',
      title: 'This workspace’s worktree was removed from disk',
      message:
        'The branch feature/sidebar-overflow-on-small-windows had a worktree at ~/Projects/Private/convergence/.worktrees/feature-sidebar-overflow-on-small-windows, and it is no longer there. Its conversations are kept; open the project to start a new workspace from the same branch.',
      action: 'welcome',
      actionLabel: 'Back to the start',
    },
  },
  play: async ({ canvas }) => {
    const heading = canvas.getByRole('heading', { level: 1 })
    const action = canvas.getByRole('button', { name: 'Back to the start' })
    await expect(action.getBoundingClientRect().top).toBeGreaterThan(
      heading.getBoundingClientRect().bottom,
    )
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth,
    )
  },
}
