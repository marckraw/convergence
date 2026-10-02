import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Ellipsis,
  Link2,
  PanelLeftClose,
  Pin,
  RotateCcw,
  Search,
  Settings,
} from 'lucide-react'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { settled } from '../../../.storybook/motion-testing'
import type { ButtonSize } from '../button/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../menu/menu'
import { IconButton } from './icon-button'

type ToolbarProps = {
  /** What the first button is called: its name and its tooltip. */
  label: string
  onSearch: () => void
}

const SIZES: { size: ButtonSize; px: number; label: string }[] = [
  { size: 'xs', px: 24, label: 'Pin conversation' },
  { size: 'sm', px: 28, label: 'Collapse sidebar' },
  { size: 'md', px: 32, label: 'Open settings' },
  { size: 'lg', px: 36, label: 'Retry' },
  // The Button's own step (ruling 9), square too.
  { size: 'xl', px: 44, label: 'Copy link' },
]

const ICONS = {
  xs: <Pin aria-hidden />,
  sm: <PanelLeftClose aria-hidden />,
  md: <Settings aria-hidden />,
  lg: <RotateCcw aria-hidden />,
  xl: <Link2 aria-hidden />,
}

/** A toolbar: a search button, then one button at every size of the scale. */
function Toolbar({ label, onSearch }: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-line bg-canvas p-1">
      <IconButton label={label} shortcut="⌘F" onClick={onSearch}>
        <Search aria-hidden />
      </IconButton>
      {SIZES.map(({ size, label: sizeLabel }) => (
        <IconButton key={size} size={size} label={sizeLabel}>
          {ICONS[size]}
        </IconButton>
      ))}
    </div>
  )
}

const meta = {
  title: 'Primitives/IconButton',
  component: Toolbar,
  args: {
    label: 'Search conversations',
    onSearch: fn(),
  },
} satisfies Meta<typeof Toolbar>

export default meta

type Story = StoryObj<typeof meta>

const tooltip = () => screen.findByRole('tooltip', {}, { timeout: 2000 })

/**
 * One label names each button and is its tooltip (R2); no native title.
 * The sizes are the scale's: 24, 28, 32 and 36 px, and the Button's own 44,
 * square.
 */
export const Default: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await expect(canvasElement.querySelector('[title]')).toBeNull()
    for (const { size, px, label } of SIZES) {
      const button = canvas.getByRole('button', { name: label })
      const box = button.getBoundingClientRect()
      await expect([box.width, box.height]).toEqual([px, px])
      await expect(button).toHaveAttribute('data-size', size)
      await userEvent.hover(button)
      await waitFor(async () =>
        expect((await tooltip()).textContent).toBe(label),
      )
      await userEvent.unhover(button)
    }
    const search = canvas.getByRole('button', { name: args.label })
    await userEvent.click(search)
    await expect(args.onSearch).toHaveBeenCalledOnce()
  },
}

/** The keyboard shows the tooltip at once, with the shortcut beside the label. */
export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ args, userEvent }) => {
    await userEvent.tab()
    const shown = await tooltip()
    await expect(shown).toHaveTextContent(args.label)
    await expect(shown).toHaveTextContent('⌘F')
    await settled(shown)
  },
}

/** Long: a long label wraps inside the tooltip, and still names the button. */
export const Long: Story = {
  args: {
    label:
      'Search every conversation in every project, archived ones included, by name',
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole('button', { name: args.label }))
    const shown = await tooltip()
    await settled(shown)
    await expect(shown.getBoundingClientRect().height).toBeGreaterThan(30)
  },
}

/**
 * Disabled with a reason (R2): it keeps its name, stays reachable by Tab,
 * and its tooltip adds why under the label.
 */
export const Disabled: Story = {
  render: () => (
    <div className="rounded-md bg-canvas p-2">
      <IconButton
        label="Archive conversation"
        disabledReason="A running turn can't be archived"
      >
        <Ellipsis aria-hidden />
      </IconButton>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole('button', {
      name: 'Archive conversation',
    })
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await expect(button).toHaveAccessibleDescription(
      "A running turn can't be archived",
    )
    await userEvent.tab()
    await expect(button).toHaveFocus()
    const shown = await tooltip()
    await expect(shown).toHaveTextContent('Archive conversation')
    await expect(shown).toHaveTextContent("A running turn can't be archived")
  },
}

/**
 * Pressed: an icon that stays on, like a pinned search or a followed crew,
 * says aria-pressed and wears R7's chosen look, the raised chip, which it
 * keeps under the pointer. Off, it is the plain ghost.
 */
export const Pressed: Story = {
  render: () => (
    <div className="flex items-center gap-1 rounded-md bg-surface-muted p-1">
      <IconButton label="Follow the crew" pressed size="sm">
        <Link2 aria-hidden />
      </IconButton>
      <IconButton label="Search conversations" pressed={false} size="sm">
        <Search aria-hidden />
      </IconButton>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const on = canvas.getByRole('button', { name: 'Follow the crew' })
    const off = canvas.getByRole('button', { name: 'Search conversations' })
    await expect(on).toHaveAttribute('aria-pressed', 'true')
    await expect(off).toHaveAttribute('aria-pressed', 'false')
    await expect(getComputedStyle(on).backgroundColor).toBe(
      tokenColor('--chip'),
    )
    await expect(getComputedStyle(on).boxShadow).not.toBe('none')
    await expect(getComputedStyle(off).boxShadow).toBe('none')
    await userEvent.hover(on)
    await expect(getComputedStyle(on).backgroundColor).toBe(
      tokenColor('--chip'),
    )
  },
}

export const PressedDark: Story = {
  ...Pressed,
  globals: { theme: 'dark' },
}

/** Busy: the spinner takes the icon's place, and the size holds. */
export const Busy: Story = {
  render: () => (
    <div className="rounded-md bg-canvas p-2">
      <IconButton label="Retry" pending>
        <RotateCcw aria-hidden />
      </IconButton>
    </div>
  ),
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Retry' })
    await expect(button).toHaveAttribute('aria-busy', 'true')
    const box = button.getBoundingClientRect()
    await expect([box.width, box.height]).toEqual([32, 32])
    const drawn = [...button.querySelectorAll('svg')].filter(
      (icon) => getComputedStyle(icon).visibility === 'visible',
    )
    await expect(drawn).toHaveLength(1)
    await expect(drawn[0]).toHaveAttribute('data-slot', 'spinner')
  },
}

/** As a menu's trigger: it opens the menu, and its tooltip gets out of the way. */
export const AsMenuTrigger: Story = {
  render: () => (
    <Menu>
      <MenuTrigger render={<IconButton label="More actions" />}>
        <Ellipsis aria-hidden />
      </MenuTrigger>
      <MenuContent>
        <MenuItem>Rename…</MenuItem>
        <MenuItem>Archive</MenuItem>
      </MenuContent>
    </Menu>
  ),
  play: async ({ canvas, userEvent }) => {
    const more = canvas.getByRole('button', { name: 'More actions' })
    await userEvent.hover(more)
    await tooltip()
    await userEvent.click(more)
    await screen.findByRole('menu')
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}
