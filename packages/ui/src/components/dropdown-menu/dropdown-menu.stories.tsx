import type { Meta, StoryObj } from '@storybook/react-vite'
import { MoreHorizontal } from 'lucide-react'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { settled } from '../../../.storybook/motion-testing'
import { Button } from '../button/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu'

type ConversationMenuProps = {
  onRename: () => void
  onArchive: () => void
  onDelete: () => void
}

/** A conversation's actions menu. */
function ConversationMenu({
  onRename,
  onArchive,
  onDelete,
}: ConversationMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Conversation actions">
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onRename}>Rename…</DropdownMenuItem>
        <DropdownMenuItem onSelect={onArchive}>Archive</DropdownMenuItem>
        <DropdownMenuItem disabled>
          Export (needs a finished turn)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete}>Delete…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const meta = {
  title: 'Primitives/DropdownMenu',
  component: ConversationMenu,
  args: {
    onRename: fn(),
    onArchive: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof ConversationMenu>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Conversation actions' })
    await userEvent.click(trigger)
    const menu = await screen.findByRole('menu')
    await settled(menu)
    await expect(screen.getAllByRole('menuitem')).toHaveLength(4)
    await expect(
      screen.getByRole('menuitem', { name: 'Export (needs a finished turn)' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    await expect(args.onArchive).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await expect(trigger).toHaveFocus()
  },
}

/** The keyboard opens it, walks it past the disabled item, and chooses. */
export const Keyboard: Story = {
  play: async ({ args, canvas, userEvent }) => {
    canvas.getByRole('button', { name: 'Conversation actions' }).focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('menu')
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Rename…' })).toHaveFocus(),
    )
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await expect(
      screen.getByRole('menuitem', { name: 'Delete…' }),
    ).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onDelete).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Reduced motion: the menu arrives without its pop. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Conversation actions' }),
    )
    const menu = await screen.findByRole('menu')
    await expect(getComputedStyle(menu).animationName).toBe('none')
    // Closing is immediate too. The story ends closed: while a modal menu is
    // open, Radix hides everything outside it from assistive tech, trigger
    // included, and axe reads that trigger as focusable inside aria-hidden,
    // though focus is trapped in the menu until it closes.
    await userEvent.keyboard('{Escape}')
    await expect(screen.queryByRole('menu')).toBeNull()
  },
}
