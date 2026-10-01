import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@convergence/ui'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { TranscriptViewMenuItems } from './transcript-view-switch.presentational'

const meta = {
  title: 'Widgets/SessionView/TranscriptViewSwitch',
  component: TranscriptViewMenuItems,
  args: {
    mode: 'compact',
    onChange: fn(),
  },
  // The items only ever live inside the header's View menu.
  render: (args) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <TranscriptViewMenuItems {...args} />
      </DropdownMenuContent>
    </DropdownMenu>
  ),
} satisfies Meta<typeof TranscriptViewMenuItems>

export default meta

type Story = StoryObj<typeof meta>

/** Compact or Full, as a radio choice; choosing Full closes the menu. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'View' }))
    const group = await screen.findByRole('group', {
      name: 'Conversation view',
    })
    await waitFor(() => expect(group).toBeVisible())
    await expect(
      screen.getByRole('menuitemradio', { name: 'Compact' }),
    ).toHaveAttribute('aria-checked', 'true')
    const full = screen.getByRole('menuitemradio', { name: 'Full' })
    await expect(full).toHaveAttribute('aria-checked', 'false')
    await expect(full).toHaveAttribute('title', 'Show every entry')
    await userEvent.click(full)
    await expect(args.onChange).toHaveBeenCalledWith('full')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

/** Full chosen; the keyboard walks to Compact and picks it. */
export const Full: Story = {
  args: { mode: 'full' },
  play: async ({ args, canvas, userEvent }) => {
    canvas.getByRole('button', { name: 'View' }).focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('menu')
    await expect(
      screen.getByRole('menuitemradio', { name: 'Full' }),
    ).toHaveAttribute('aria-checked', 'true')
    await waitFor(() =>
      expect(
        screen.getByRole('menuitemradio', { name: 'Compact' }),
      ).toHaveFocus(),
    )
    await userEvent.keyboard('{Enter}')
    await expect(args.onChange).toHaveBeenCalledWith('compact')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
