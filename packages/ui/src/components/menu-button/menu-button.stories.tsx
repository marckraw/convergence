import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen } from 'storybook/test'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../menu/menu'
import { StatusDot } from '../status-dot/status-dot'
import { MenuButton } from './menu-button'

/** The conversation header's three: a menu, and two that open panels. */
function HeaderMenus({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-line bg-canvas p-1">
      <Menu>
        <MenuTrigger render={<MenuButton type="button" />}>View</MenuTrigger>
        <MenuContent align="end">
          <MenuItem onClick={onPick}>Conversation</MenuItem>
          <MenuItem onClick={onPick}>Turns</MenuItem>
        </MenuContent>
      </Menu>
      <MenuButton type="button">Details</MenuButton>
      <MenuButton type="button" className="text-info-ink">
        <StatusDot tone="info" size="sm" />
        Project
      </MenuButton>
    </div>
  )
}

const meta = {
  title: 'Primitives/MenuButton',
  component: HeaderMenus,
  args: { onPick: fn() },
} satisfies Meta<typeof HeaderMenus>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Its words are its name, and the chevron only says more comes: as a menu's
 * trigger it opens the menu, 28 px like the header's other controls (R3).
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const view = canvas.getByRole('button', { name: 'View' })
    await expect(view).toHaveAttribute('data-size', 'sm')
    await expect(view.getBoundingClientRect().height).toBe(28)
    await expect(view.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    await userEvent.click(view)
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Turns' }),
    )
    await expect(args.onPick).toHaveBeenCalledOnce()
    await expect(canvas.getByRole('button', { name: 'Project' })).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
