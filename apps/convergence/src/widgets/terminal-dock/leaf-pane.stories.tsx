import type { Meta, StoryObj } from '@storybook/react-vite'
import type { LeafNode, TerminalTab } from '@/entities/terminal'
import { expect, fn } from 'storybook/test'
import { HideDockButton } from './hide-dock-button.presentational'
import { LeafPaneView, type TerminalPaneSlot } from './leaf-pane.presentational'

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

const leaf: LeafNode = {
  kind: 'leaf',
  id: 'leaf-1',
  activeTabId: 'tests',
  tabs: [
    tab('zsh', 'zsh'),
    tab('tests', 'npm run test:stories'),
    tab('build', 'npm run build', { status: 'exited', exitCode: 0, pid: null }),
  ],
}

/**
 * The terminal itself is xterm behind IPC, which the dock's container draws;
 * here a still picture of one stands in for it.
 */
const renderTerminal = ({ tabId, isFocused }: TerminalPaneSlot) => (
  <section
    aria-label={`Terminal ${tabId}`}
    data-focused={isFocused ? '' : undefined}
    className="flex min-h-0 flex-1 flex-col bg-terminal-bg px-2 py-1.5 font-mono text-xs text-terminal-ink"
  >
    <span>~/Projects/Private/convergence $ npm run test:stories</span>
    <span>✓ 412 stories passed</span>
  </section>
)

const meta = {
  title: 'Widgets/Terminal dock/Leaf pane',
  component: LeafPaneView,
  args: {
    leaf,
    focusedLeafId: 'leaf-1',
    onSelectTab: fn(),
    onNewTab: fn(),
    onSplit: fn(),
    onCloseTab: fn(),
    onFocusLeaf: fn(),
    renderTerminal,
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      // The dock is dark in both themes (R12), on the terminal's own tokens.
      <div className="flex h-72 bg-terminal-bg text-terminal-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LeafPaneView>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One pane: its tabs, the split and close buttons at the strip's end, and the
 * open tab's terminal under them. A click anywhere in it focuses the pane.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('tablist', { name: 'Terminal tabs' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('region', { name: 'Terminal tests' }),
    ).toBeVisible()

    await userEvent.click(canvas.getByRole('tab', { name: 'zsh' }))
    await expect(args.onSelectTab).toHaveBeenCalledWith('leaf-1', 'zsh')
    await expect(args.onFocusLeaf).toHaveBeenCalledWith('leaf-1')

    await userEvent.click(
      canvas.getByRole('button', { name: 'Split horizontal' }),
    )
    await expect(args.onSplit).toHaveBeenCalledWith('leaf-1', 'horizontal')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Split vertical' }),
    )
    await expect(args.onSplit).toHaveBeenCalledWith('leaf-1', 'vertical')
    // One close per tab, on the tab itself: the toolbar draws no second ✕
    // for the open one (NAV-9).
    await expect(
      canvas.queryByRole('button', { name: 'Close tab' }),
    ).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'New tab' }))
    await expect(args.onNewTab).toHaveBeenCalledWith('leaf-1')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

const onHide = fn()

/**
 * The pane at the dock's top-right corner carries the dock's own control
 * after the splits: Hide terminal, which says ⌘` and puts the dock away
 * without ending its terminals.
 */
export const DockControls: Story = {
  args: {
    dockControls: (
      <HideDockButton placement="bottom" shortcut="⌘`" onHide={onHide} />
    ),
  },
  play: async ({ canvas, userEvent }) => {
    onHide.mockClear()
    const hide = canvas.getByRole('button', { name: 'Hide terminal' })
    await expect(hide).toHaveAttribute('data-tooltip-shortcut', '⌘`')
    await userEvent.click(hide)
    await expect(onHide).toHaveBeenCalledOnce()
    // It sits after the splits, at the strip's end.
    const buttons = canvas.getAllByRole('button')
    await expect(buttons.at(-1)).toBe(hide)
  },
}
