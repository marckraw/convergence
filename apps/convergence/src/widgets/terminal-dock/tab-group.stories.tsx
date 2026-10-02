import type { Meta, StoryObj } from '@storybook/react-vite'
import type { TerminalTab } from '@/entities/terminal'
import { expect, fn } from 'storybook/test'
import { TabGroup } from './tab-group.presentational'

const tab = (
  id: string,
  title: string,
  overrides: Partial<TerminalTab> = {},
): TerminalTab => ({
  id,
  cwd: '/Users/marcin/Projects/Private/convergence',
  title,
  pid: 4242,
  shell: '/bin/zsh',
  status: 'running',
  exitCode: null,
  ...overrides,
})

const tabs: TerminalTab[] = [
  tab('zsh', 'zsh'),
  tab('tests', 'npm run test:stories'),
  tab('build', 'npm run build', { status: 'exited', exitCode: 0, pid: null }),
]

const meta = {
  title: 'Widgets/Terminal dock/Tab group',
  component: TabGroup,
  args: {
    tabs,
    activeTabId: 'tests',
    onSelect: fn(),
    onCloseTab: fn(),
    onNewTab: fn(),
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      // The dock forces dark in both themes the app's way, with a subtree
      // data-theme (R12), not a `.dark` class, which no longer themes (DS2).
      <div data-theme="dark" className="bg-terminal-bg text-terminal-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TabGroup>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A pane's terminals as tabs: the active one selected, each closable, the
 * arrow keys move between them, and a button opens another.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('tablist', { name: 'Terminal tabs' }),
    ).toBeVisible()
    const active = canvas.getByRole('tab', { name: 'npm run test:stories' })
    await expect(active).toHaveAttribute('aria-selected', 'true')
    await expect(
      canvas.getByRole('tab', { name: 'npm run build (exited)' }),
    ).toHaveAttribute('aria-selected', 'false')

    await userEvent.click(canvas.getByRole('tab', { name: 'zsh' }))
    await expect(args.onSelect).toHaveBeenCalledWith('zsh')

    // The pointer's close (MAR-3616 DS3c): the tab list holds only tabs, so
    // the x is out of the tab order and the accessibility tree, and the
    // keyboard closes a tab with Delete.
    await userEvent.click(canvas.getByLabelText('Close tab npm run build'))
    await expect(args.onCloseTab).toHaveBeenCalledWith('build')
    // Closing a tab does not select it.
    await expect(args.onSelect).not.toHaveBeenCalledWith('build')
    const zsh = canvas.getByRole('tab', { name: 'zsh' })
    await expect(zsh).toHaveAttribute('aria-keyshortcuts', 'Delete')
    zsh.focus()
    await userEvent.keyboard('{Delete}')
    await expect(args.onCloseTab).toHaveBeenLastCalledWith('zsh')

    await userEvent.click(canvas.getByRole('button', { name: 'New tab' }))
    await expect(args.onNewTab).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The arrow keys move between tabs, and moving selects. */
export const Keyboard: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const active = canvas.getByRole('tab', { name: 'npm run test:stories' })
    active.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(
      canvas.getByRole('tab', { name: 'npm run build (exited)' }),
    ).toHaveFocus()
    await expect(args.onSelect).toHaveBeenCalledWith('build')
  },
}

/** Many tabs with long titles stay in the one row the pane has. */
export const Long: Story = {
  args: {
    tabs: Array.from({ length: 8 }, (_, index) =>
      tab(
        `long-${index}`,
        `node --watch scripts/build-everything.mjs --package=${index + 1}`,
      ),
    ),
    activeTabId: 'long-0',
  },
  play: async ({ canvas }) => {
    const list = canvas.getByRole('tablist', { name: 'Terminal tabs' })
    await expect(canvas.getAllByRole('tab')).toHaveLength(8)
    await expect(list.getBoundingClientRect().height).toBeLessThan(40)
  },
}

/**
 * New tab's tooltip says its key, and so does the open tab's ✕, the tab ⌘W
 * closes (NAV-23).
 */
export const Shortcut: Story = {
  args: { newTabShortcut: '⌘T', closeTabShortcut: '⌘W' },
  play: async ({ args, canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'New tab' }),
    ).toHaveAttribute('data-tooltip-shortcut', '⌘T')
    // The open tab is "npm run test:stories"; ⌘W leaves "zsh" alone.
    await expect(
      canvas.getByLabelText('Close tab npm run test:stories'),
    ).toHaveAttribute('data-tooltip-shortcut', args.closeTabShortcut)
    await expect(canvas.getByLabelText('Close tab zsh')).not.toHaveAttribute(
      'data-tooltip-shortcut',
    )
  },
}
