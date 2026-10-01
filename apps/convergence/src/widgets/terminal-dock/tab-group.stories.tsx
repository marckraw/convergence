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

/*
 * Known gaps, switched off on these stories alone.
 */
const tabStructureGaps = [
  // a11y-known: the tablist holds each tab's close button and the New tab
  // button beside the tabs themselves — fixed by the sweep (DS4)
  { id: 'aria-required-children', enabled: false },
  // a11y-known: each tab's aria-controls names a panel that is never rendered
  // (the terminal sits outside Tabs.Content) — fixed by the sweep (DS4)
  { id: 'aria-valid-attr-value', enabled: false },
]
// a11y-known: an exited tab is drawn at 60% opacity, 2.9:1 on the dock —
// fixed by the sweep (DS4)
const exitedTabContrast = { id: 'color-contrast', enabled: false }

/** For stories that draw an exited tab. */
const knownTabGaps = {
  a11y: { config: { rules: [...tabStructureGaps, exitedTabContrast] } },
}

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
      <div data-theme="dark" className="bg-[#0b0b0f] text-zinc-100">
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
  parameters: knownTabGaps,
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

    await userEvent.click(
      canvas.getByRole('button', { name: 'Close tab npm run build' }),
    )
    await expect(args.onCloseTab).toHaveBeenCalledWith('build')
    // Closing a tab does not select it.
    await expect(args.onSelect).not.toHaveBeenCalledWith('build')

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
  parameters: knownTabGaps,
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
  parameters: { a11y: { config: { rules: tabStructureGaps } } },
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
