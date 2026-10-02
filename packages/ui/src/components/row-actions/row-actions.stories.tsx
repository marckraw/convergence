import type { Meta, StoryObj } from '@storybook/react-vite'
import { Archive, MessageSquare, Trash2 } from 'lucide-react'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { arrived } from '../../../.storybook/motion-testing'
import { ListRow } from '../list-row/list-row'
import { MenuItem, MenuSeparator } from '../menu/menu'
import { RowActions } from './row-actions'

type SessionRowProps = {
  onOpen: () => void
  onArchive: () => void
  onDelete: () => void
}

/** A sidebar session row with its own ⋯, as the chat list draws it. */
function SessionRow({ onOpen, onArchive, onDelete }: SessionRowProps) {
  return (
    <div className="w-72 rounded-md bg-canvas p-2">
      <ListRow
        density="compact"
        leading={<MessageSquare aria-hidden />}
        title="Rewrite the importer"
        render={<button type="button" onClick={onOpen} />}
        actions={
          <RowActions label="Session actions Rewrite the importer">
            <MenuItem onClick={onArchive}>
              <Archive className="size-3.5" aria-hidden />
              Archive session
            </MenuItem>
            <MenuSeparator />
            <MenuItem variant="danger" onClick={onDelete}>
              <Trash2 className="size-3.5" aria-hidden />
              Delete session…
            </MenuItem>
          </RowActions>
        }
      />
    </div>
  )
}

const actionsOf = (trigger: HTMLElement) =>
  trigger.closest('[data-slot="list-row-actions"]') as HTMLElement

/** Menus leave in --motion-exit; wait until they're gone so the next check sees a settled page. */
const menusClosed = () =>
  waitFor(() =>
    expect(document.querySelector('[data-slot="menu-content"]')).toBeNull(),
  )

const meta = {
  title: 'Components/RowActions',
  component: SessionRow,
  args: { onOpen: fn(), onArchive: fn(), onDelete: fn() },
} satisfies Meta<typeof SessionRow>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The ⋯ is named for its row, opens the row's menu without opening the row,
 * and stays in sight while its menu is open: the focus has left the row for
 * the menu, and nothing hovers it, yet it doesn't fade (NAV-14).
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', {
      name: 'Session actions Rewrite the importer',
    })
    await expect(getComputedStyle(actionsOf(trigger)).opacity).toBe('0')
    await userEvent.click(trigger)
    const menu = await screen.findByRole('menu')
    await expect(args.onOpen).not.toHaveBeenCalled()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() =>
      expect(menu.contains(document.activeElement)).toBe(true),
    )
    await waitFor(() =>
      expect(getComputedStyle(actionsOf(trigger)).opacity).toBe('1'),
    )
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Archive session' }),
    )
    await expect(args.onArchive).toHaveBeenCalledOnce()
    await menusClosed()
    await expect(trigger).toHaveFocus()
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', {
      name: 'Session actions Rewrite the importer',
    })
    await userEvent.click(trigger)
    const menu = await screen.findByRole('menu')
    await arrived(menu)
    await expect(
      within(menu).getByRole('menuitem', { name: 'Delete session…' }),
    ).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await menusClosed()
    await expect(trigger).toHaveFocus()
  },
}

/** The keyboard reaches the ⋯ after its row, and Enter opens the menu on its first item. */
export const Keyboard: Story = {
  play: async ({ canvas, userEvent }) => {
    const row = canvas.getByRole('button', { name: /^Rewrite the importer/ })
    const trigger = canvas.getByRole('button', {
      name: 'Session actions Rewrite the importer',
    })
    await userEvent.tab()
    await expect(row).toHaveFocus()
    await userEvent.tab()
    await expect(trigger).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    const menu = await screen.findByRole('menu')
    await waitFor(() =>
      expect(
        within(menu).getByRole('menuitem', { name: 'Archive session' }),
      ).toHaveFocus(),
    )
    await userEvent.keyboard('{Escape}')
    await menusClosed()
  },
}

/** Reduced motion: the menu still opens and the ⋯ still stays in sight. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', {
      name: 'Session actions Rewrite the importer',
    })
    await userEvent.click(trigger)
    await screen.findByRole('menu')
    await waitFor(() =>
      expect(getComputedStyle(actionsOf(trigger)).opacity).toBe('1'),
    )
    await userEvent.keyboard('{Escape}')
    await menusClosed()
  },
}
