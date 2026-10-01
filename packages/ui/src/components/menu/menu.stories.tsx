import type { Meta, StoryObj } from '@storybook/react-vite'
import { Copy, MoreVertical, Pencil, Pin, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import {
  recordAnimatingDuring,
  arrived,
  snapshotWhileAnimating,
} from '../../../.storybook/motion-testing'
import { Button } from '../button/button'
import { IconButton } from '../icon-button/icon-button'
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from './menu'

type ConversationActionsProps = {
  onRename: () => void
  onCopyLink: () => void
  onDelete: () => void
  defaultOpen?: boolean
}

/** A conversation's actions, as the header's More menu offers them. */
function ConversationActions({
  onRename,
  onCopyLink,
  onDelete,
  defaultOpen,
}: ConversationActionsProps) {
  return (
    <Menu defaultOpen={defaultOpen}>
      <MenuTrigger
        render={<IconButton label="Conversation actions" size="sm" />}
      >
        <MoreVertical />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuGroup>
          <MenuLabel>Conversation</MenuLabel>
          <MenuItem onClick={onRename}>
            <Pencil className="size-4" aria-hidden />
            Rename…
          </MenuItem>
          <MenuItem>
            <Pin className="size-4" aria-hidden />
            Pin
          </MenuItem>
          <MenuItem onClick={onCopyLink}>
            <Copy className="size-4" aria-hidden />
            Copy link
            <MenuShortcut>⌘L</MenuShortcut>
          </MenuItem>
          <MenuItem disabled>Move to project…</MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem variant="danger" onClick={onDelete}>
          <Trash2 className="size-4" aria-hidden />
          Delete conversation…
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

/** Menus leave in --motion-exit; wait until they're gone so the next check sees a settled page. */
const menusClosed = () =>
  waitFor(() =>
    expect(document.querySelector('[data-slot="menu-content"]')).toBeNull(),
  )

const meta = {
  title: 'Primitives/Menu',
  component: ConversationActions,
  args: {
    onRename: fn(),
    onCopyLink: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof ConversationActions>

export default meta

type Story = StoryObj<typeof meta>

/** A click opens it from its trigger; an item acts and the menu closes. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Conversation actions' })
    await userEvent.click(trigger)
    const menu = await screen.findByRole('menu')
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    // It grows from the trigger: Base UI's Positioner says where that is.
    await expect(
      getComputedStyle(menu).getPropertyValue('--transform-origin'),
    ).not.toBe('')
    // A shortcut is a Kbd, the one look for a key, at the item's end.
    await expect(within(menu).getByText('⌘L').tagName).toBe('KBD')
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Rename…' }),
    )
    await expect(args.onRename).toHaveBeenCalledOnce()
    await menusClosed()
    await expect(trigger).toHaveFocus()
  },
}

/** Nothing waits for the animation: an item works while the menu still grows in. */
export const ClickWhileOpening: Story = {
  name: 'Click while it opens',
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Conversation actions' }),
    )
    const menu = await screen.findByRole('menu')
    const opening = await snapshotWhileAnimating(menu, 'opacity')
    await expect(opening.opacity).toBeLessThan(1)
    await expect(opening.scale).toBeLessThan(1)
    const item = within(menu).getByRole('menuitem', { name: /Copy link/ })
    const click = recordAnimatingDuring(menu, item)
    await userEvent.click(item)
    await expect(click.animating).toBe(true)
    await expect(args.onCopyLink).toHaveBeenCalledOnce()
    await menusClosed()
  },
}

/**
 * The keyboard: Enter opens it with focus inside, the arrows move, a letter
 * jumps to the item it starts, and Escape closes it with the focus back on
 * the trigger.
 */
export const Keyboard: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Conversation actions' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    const menu = await screen.findByRole('menu')
    await waitFor(() =>
      expect(menu.contains(document.activeElement)).toBe(true),
    )
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await expect(
      within(menu).getByRole('menuitem', { name: /Copy link/ }),
    ).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await menusClosed()
    await expect(trigger).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    const again = await screen.findByRole('menu')
    await waitFor(() =>
      expect(again.contains(document.activeElement)).toBe(true),
    )
    await userEvent.keyboard('c')
    await expect(
      within(again).getByRole('menuitem', { name: /Copy link/ }),
    ).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onCopyLink).toHaveBeenCalledOnce()
    await menusClosed()
  },
}

/** A press outside closes it, and nothing in it runs. */
export const OutsideClick: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Conversation actions' })
    await userEvent.click(trigger)
    const menu = await screen.findByRole('menu')
    await arrived(menu)
    await userEvent.click(document.body)
    await menusClosed()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(args.onRename).not.toHaveBeenCalled()
  },
}

/** Disabled: the item is announced as unavailable; the others still work. */
export const Disabled: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Conversation actions' }),
    )
    const menu = await screen.findByRole('menu')
    const item = within(menu).getByRole('menuitem', {
      name: 'Move to project…',
    })
    await expect(item).toHaveAttribute('aria-disabled', 'true')
    await expect(item).toHaveAttribute('data-disabled')
    await arrived(menu)
  },
}

/** Danger: the destructive item is the one red item, and says what it does in words (R5). */
export const Danger: Story = {
  args: { defaultOpen: true },
  play: async ({ args, userEvent }) => {
    const menu = await screen.findByRole('menu')
    const item = within(menu).getByRole('menuitem', {
      name: 'Delete conversation…',
    })
    await expect(item).toHaveAttribute('data-variant', 'danger')
    await expect(
      within(menu)
        .getAllByRole('menuitem')
        .filter((each) => each.dataset.variant === 'danger'),
    ).toHaveLength(1)
    await userEvent.click(item)
    await expect(args.onDelete).toHaveBeenCalledOnce()
    await menusClosed()
  },
}

/** A view menu: options that are on or off, and one choice of several. */
function ViewOptions() {
  const [wrap, setWrap] = useState(true)
  const [density, setDensity] = useState('comfortable')
  return (
    <Menu>
      <MenuTrigger render={<Button variant="secondary" />}>View</MenuTrigger>
      <MenuContent align="start">
        <MenuCheckboxItem checked={wrap} onCheckedChange={setWrap}>
          Wrap long lines
        </MenuCheckboxItem>
        <MenuCheckboxItem>Show tool calls</MenuCheckboxItem>
        <MenuSeparator />
        <MenuGroup>
          <MenuLabel>Density</MenuLabel>
          <MenuRadioGroup value={density} onValueChange={setDensity}>
            <MenuRadioItem value="comfortable">Comfortable</MenuRadioItem>
            <MenuRadioItem value="compact">Compact</MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
      </MenuContent>
    </Menu>
  )
}

/** Checkbox and radio items read out their state and keep the menu open. */
export const CheckboxAndRadio: Story = {
  render: () => <ViewOptions />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'View' }))
    const menu = await screen.findByRole('menu')
    const wrap = within(menu).getByRole('menuitemcheckbox', {
      name: 'Wrap long lines',
    })
    await expect(wrap).toBeChecked()
    await userEvent.click(wrap)
    await expect(wrap).not.toBeChecked()
    const compact = within(menu).getByRole('menuitemradio', {
      name: 'Compact',
    })
    await expect(compact).not.toBeChecked()
    await userEvent.click(compact)
    await expect(compact).toBeChecked()
    await expect(
      within(menu).getByRole('menuitemradio', { name: 'Comfortable' }),
    ).not.toBeChecked()
    await arrived(menu)
  },
}

/** A submenu opens from its item, by the pointer or the right arrow. */
export const Submenu: Story = {
  render: () => (
    <Menu>
      <MenuTrigger render={<Button variant="secondary" />}>Open in</MenuTrigger>
      <MenuContent align="start">
        <MenuItem>Finder</MenuItem>
        <MenuSub>
          <MenuSubTrigger>Editor</MenuSubTrigger>
          <MenuSubContent>
            <MenuItem>Cursor</MenuItem>
            <MenuItem>VS Code</MenuItem>
            <MenuItem>Zed</MenuItem>
          </MenuSubContent>
        </MenuSub>
      </MenuContent>
    </Menu>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open in' }))
    const menu = await screen.findByRole('menu')
    await waitFor(() =>
      expect(menu.contains(document.activeElement)).toBe(true),
    )
    await userEvent.hover(
      within(menu).getByRole('menuitem', { name: 'Editor' }),
    )
    const submenu = await waitFor(() => {
      const menus = screen.getAllByRole('menu')
      expect(menus).toHaveLength(2)
      return menus[1] as HTMLElement
    })
    await arrived(submenu)
    await expect(
      within(submenu).getByRole('menuitem', { name: 'Zed' }),
    ).toBeVisible()
    await arrived(submenu)
  },
}

/** Long: a long menu scrolls inside the window, and the arrows scroll it. */
export const Long: Story = {
  render: () => (
    <Menu>
      <MenuTrigger render={<Button variant="secondary" />}>
        Move to project
      </MenuTrigger>
      <MenuContent className="max-w-72">
        <MenuGroup>
          <MenuLabel>Projects</MenuLabel>
          {Array.from({ length: 40 }, (_, index) =>
            index === 3
              ? 'a-project-with-a-name-long-enough-to-wrap-inside-the-menu'
              : `project-${index + 1}`,
          ).map((name) => (
            <MenuItem key={name}>{name}</MenuItem>
          ))}
        </MenuGroup>
      </MenuContent>
    </Menu>
  ),
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole('button', { name: 'Move to project' }).focus()
    await userEvent.keyboard('{Enter}')
    const menu = await screen.findByRole('menu')
    await expect(within(menu).getAllByRole('menuitem')).toHaveLength(40)
    await arrived(menu)
    await expect(menu.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    )
    await userEvent.keyboard('{End}')
    const last = within(menu).getByRole('menuitem', { name: 'project-40' })
    await waitFor(() => expect(last).toHaveFocus())
    await expect(menu.scrollTop).toBeGreaterThan(0)
  },
}

export const Dark: Story = {
  args: { defaultOpen: true },
  globals: { theme: 'dark' },
  play: async () => {
    await arrived(await screen.findByRole('menu'))
  },
}

/** Reduced motion: it fades in where it stands, without the grow or the travel. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Conversation actions' }),
    )
    const menu = await screen.findByRole('menu')
    const opening = await snapshotWhileAnimating(menu, 'opacity')
    await expect(opening.opacity).toBeLessThan(1)
    await expect(opening.scale).toBe(1)
    await expect(opening.shiftY).toBe(0)
    await arrived(menu)
  },
}
