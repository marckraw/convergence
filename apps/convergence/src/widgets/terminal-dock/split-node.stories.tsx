import type { Meta, StoryObj } from '@storybook/react-vite'
import type { LeafNode, PaneTree, TerminalTab } from '@/entities/terminal'
import { expect, fn } from 'storybook/test'
import { HideDockButton } from './hide-dock-button.presentational'
import type { TerminalPaneSlot } from './leaf-pane.presentational'
import { SplitNodeView } from './split-node.presentational'

const tab = (id: string, title: string): TerminalTab => ({
  id,
  cwd: '/Users/marcin/Projects/Private/convergence',
  title,
  pid: 4242,
  shell: '/bin/zsh',
  status: 'running',
  exitCode: null,
})

const leaf = (id: string, tabs: TerminalTab[]): LeafNode => ({
  kind: 'leaf',
  id,
  activeTabId: tabs[0]?.id ?? '',
  tabs,
})

/** Two panes side by side, the right one split again top and bottom. */
const tree: PaneTree = {
  kind: 'split',
  id: 'root',
  direction: 'horizontal',
  sizes: [50, 50],
  children: [
    leaf('left', [tab('server', 'npm run dev:seed')]),
    {
      kind: 'split',
      id: 'right',
      direction: 'vertical',
      sizes: [60, 40],
      children: [
        leaf('top', [tab('tests', 'npm run test:unit')]),
        leaf('bottom', [tab('git', 'git status')]),
      ],
    },
  ],
}

/** xterm sits behind IPC in the dock's container; a still picture stands in. */
const renderTerminal = ({ tabId }: TerminalPaneSlot) => (
  <section
    aria-label={`Terminal ${tabId}`}
    className="flex min-h-0 flex-1 bg-terminal-bg px-2 py-1.5 font-mono text-xs text-terminal-ink"
  >
    ~/Projects/Private/convergence $
  </section>
)

const meta = {
  title: 'Widgets/Terminal dock/Split node',
  component: SplitNodeView,
  args: {
    tree,
    focusedLeafId: 'top',
    onSelectTab: fn(),
    onNewTab: fn(),
    onSplit: fn(),
    onCloseTab: fn(),
    onFocusLeaf: fn(),
    onResizeSplit: fn(),
    renderTerminal,
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-96 bg-terminal-bg text-terminal-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SplitNodeView>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A split draws each side's pane, with a handle between them that resizes
 * it; every pane keeps its own tabs and its own buttons.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getAllByRole('tablist')).toHaveLength(3)
    for (const name of ['server', 'tests', 'git']) {
      await expect(
        canvas.getByRole('region', { name: `Terminal ${name}` }),
      ).toBeVisible()
    }
    const [across, down] = canvas.getAllByRole('separator')
    await expect(canvas.getAllByRole('separator')).toHaveLength(2)
    // Each line is the resize line (NAV-16): a 13 px hit area across its
    // thin side, and the keyboard reaches it.
    await expect(across.getBoundingClientRect().width).toBe(13)
    await expect(getComputedStyle(across).width).toBe('1px')
    await expect(down.getBoundingClientRect().height).toBe(13)
    await expect(getComputedStyle(down).height).toBe('1px')
    across.focus()
    await expect(across).toHaveFocus()

    // A click in a pane focuses that pane.
    await userEvent.click(canvas.getByRole('tab', { name: 'git status' }))
    await expect(args.onFocusLeaf).toHaveBeenCalledWith('bottom')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** One pane alone is drawn as that pane, with no handle. */
export const Single: Story = {
  args: { tree: leaf('only', [tab('zsh', 'zsh')]) },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('tablist')).toHaveLength(1)
    await expect(canvas.queryByRole('separator')).toBeNull()
  },
}

/**
 * The dock's own control (Hide terminal) is drawn once, on the pane at the
 * dock's top-right corner: the right-hand side, then the top of that.
 */
export const DockControls: Story = {
  args: {
    dockControls: (
      <HideDockButton placement="bottom" shortcut="⌘`" onHide={fn()} />
    ),
  },
  play: async ({ canvas }) => {
    const hide = canvas.getByRole('button', { name: 'Hide terminal' })
    await expect(
      canvas.getAllByRole('button', { name: 'Hide terminal' }),
    ).toHaveLength(1)
    await expect(hide.closest('[data-leaf-id]')).toHaveAttribute(
      'data-leaf-id',
      'top',
    )
  },
}
