import type { Meta, StoryObj } from '@storybook/react-vite'
import { TooltipProvider } from '@convergence/ui'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { SidebarSearchToggle } from './sidebar-search-toggle.presentational'

const meta = {
  title: 'Widgets/Sidebar/Sidebar search toggle',
  component: SidebarSearchToggle,
  args: { open: false, onToggle: fn(), shortcut: '⌘F' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof SidebarSearchToggle>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Opens the sidebar's search, says whether it is open, and names itself; its
 * tooltip shows the key that opens it too (NAV-23).
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole('button', { name: 'Search conversations' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await userEvent.hover(toggle)
    const tooltip = await screen.findByRole('tooltip')
    await expect(tooltip).toHaveTextContent('Search conversations')
    await expect(tooltip).toHaveTextContent('⌘F')
    await userEvent.click(toggle)
    await expect(args.onToggle).toHaveBeenCalledOnce()
    await userEvent.unhover(toggle)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Open: the same button, now saying the search is showing. */
export const Open: Story = {
  args: { open: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Search conversations' }),
    ).toHaveAttribute('aria-pressed', 'true')
  },
}
