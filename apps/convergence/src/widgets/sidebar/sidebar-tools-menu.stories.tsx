import type { Meta, StoryObj } from '@storybook/react-vite'
import { TooltipProvider } from '@convergence/ui'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { SidebarToolsMenu } from './sidebar-tools-menu.presentational'

const meta = {
  title: 'Widgets/Sidebar/Sidebar tools menu',
  component: SidebarToolsMenu,
  args: {
    activeSurface: 'code',
    hasActiveProject: true,
    onOpenDialog: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="w-64">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof SidebarToolsMenu>

export default meta

type Story = StoryObj<typeof meta>

/** The sidebar's Tools: every dialog it opens, one item each. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Open sidebar tools' })
    await userEvent.click(trigger)
    const menu = await screen.findByRole('menu')
    await waitFor(() => expect(menu).toBeVisible())
    for (const name of [
      'Spaces',
      'Project Settings',
      'Providers',
      'MCP Servers',
      'Skills',
      'Prompt Library',
      'Release notes',
    ]) {
      await expect(screen.getByRole('menuitem', { name })).not.toHaveAttribute(
        'aria-disabled',
      )
    }
    await userEvent.click(screen.getByRole('menuitem', { name: 'Providers' }))
    await expect(args.onOpenDialog).toHaveBeenCalledWith('providers', undefined)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await expect(trigger).toHaveFocus()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** With no project open, the project's own tools are there but unavailable. */
export const Disabled: Story = {
  args: { hasActiveProject: false },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Open sidebar tools' }),
    )
    await screen.findByRole('menu')
    for (const name of [
      'Project Settings',
      'MCP Servers',
      'Skills',
      'Prompt Library',
    ]) {
      await expect(screen.getByRole('menuitem', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    }
    await expect(
      screen.getByRole('menuitem', { name: 'Spaces' }),
    ).not.toHaveAttribute('aria-disabled')
    // Ends closed: an open modal menu hides the trigger from assistive tech.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

/**
 * The collapsed rail's button: the same square ⋯, its tooltip to the right
 * like every rail control's (NAV-17), and the keyboard opens it.
 */
export const Rail: Story = {
  args: { tooltipSide: 'right', activeSurface: 'chat' },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Open sidebar tools' })
    await expect(trigger).toHaveAttribute('data-tooltip-side', 'right')
    await userEvent.keyboard('{Tab}')
    await expect(trigger).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('menu')
    // On the chat surface the project's settings are not this menu's to open.
    await expect(
      screen.getByRole('menuitem', { name: 'Project Settings' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await expect(trigger).toHaveFocus()
  },
}

/**
 * The way into the Command Center (NAV-23): its item says the key that opens
 * it from anywhere, at the item's end (MenuShortcut).
 */
export const CommandCenter: Story = {
  args: { commandCenter: { shortcut: '⌘K', onOpen: fn() } },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Open sidebar tools' }),
    )
    await screen.findByRole('menu')
    const item = screen.getByRole('menuitem', { name: /^Command Center…/ })
    await expect(item).toHaveTextContent('⌘K')
    await userEvent.click(item)
    await expect(args.commandCenter?.onOpen).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}
