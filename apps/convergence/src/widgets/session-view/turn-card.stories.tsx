import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Turn, TurnFileChange } from '@/entities/turn'
import { expect, fn, waitFor, within } from 'storybook/test'
import { TurnCard } from './turn-card.presentational'
import { buildTurnFileChangeRows } from './turn-file-change-rows.pure'

const turn: Turn = {
  id: 'turn-4',
  sessionId: 'session-4f2c',
  sequence: 4,
  startedAt: '2026-10-01T14:02:00.000Z',
  endedAt: '2026-10-01T14:06:12.000Z',
  status: 'completed',
  summary: 'Keep focus in the composer when a picker closes',
  providerAccountId: null,
  model: 'claude-opus-4-1',
  effort: 'high',
}

const change = (
  filePath: string,
  status: TurnFileChange['status'],
  additions: number,
  deletions: number,
): TurnFileChange => ({
  id: `change-${filePath}`,
  sessionId: 'session-4f2c',
  turnId: 'turn-4',
  repoRoot: null,
  filePath,
  oldPath: null,
  status,
  additions,
  deletions,
  diff: '@@ -1,1 +1,1 @@\n-old\n+new',
  truncated: false,
  binary: false,
  createdAt: '2026-10-01T14:06:12.000Z',
})

const fileChanges = [
  change(
    'src/features/composer/skill-picker.presentational.tsx',
    'modified',
    6,
    2,
  ),
  change(
    'src/features/composer/skill-picker.container.test.tsx',
    'added',
    48,
    0,
  ),
  change('src/features/composer/legacy-focus.pure.ts', 'deleted', 0, 31),
]

const meta = {
  title: 'Widgets/SessionView/TurnCard',
  component: TurnCard,
  args: {
    turn,
    fileChanges,
    fileRows: buildTurnFileChangeRows(fileChanges),
    expanded: false,
    selectedTreePath: null,
    onToggle: fn(),
    onSelectFile: fn(),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full rounded-md border border-line bg-canvas">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TurnCard>

export default meta

type Story = StoryObj<typeof meta>

/** A finished turn: its summary, how many files, and the lines it changed. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('button', { name: /Turn 4/ })
    await expect(card).toHaveTextContent(
      'Keep focus in the composer when a picker closes',
    )
    await expect(card).toHaveTextContent('3 files')
    await expect(card).toHaveTextContent('+54')
    await expect(card).toHaveTextContent('−33')
    await userEvent.click(card)
    await expect(args.onToggle).toHaveBeenCalledOnce()
  },
}

/** Open: the turn's files as a tree. */
export const Expanded: Story = {
  args: { expanded: true },
  play: async ({ args, canvasElement, userEvent }) => {
    // The tree is drawn by @pierre/trees inside its own shadow root.
    const tree = await waitFor(
      () => {
        const root = canvasElement.querySelector(
          'file-tree-container',
        )?.shadowRoot
        if (!root) throw new Error('the tree has not rendered yet')
        return root as unknown as HTMLElement
      },
      { timeout: 3000 },
    )
    const file = await within(tree).findByRole(
      'treeitem',
      { name: 'legacy-focus.pure.ts' },
      { timeout: 3000 },
    )
    await userEvent.click(file)
    await expect(args.onSelectFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: 'src/features/composer/legacy-focus.pure.ts',
      }),
    )
  },
}

/** Still running, nothing changed yet. */
export const Busy: Story = {
  args: {
    turn: { ...turn, status: 'running', endedAt: null, summary: null },
    fileChanges: [],
    fileRows: [],
  },
  play: async ({ canvas }) => {
    const card = canvas.getByRole('button', { name: /Turn 4/ })
    await expect(card).toHaveTextContent('in progress')
    await expect(card).toHaveTextContent('working…')
  },
}

/** The turn errored. */
export const Failed: Story = {
  args: { turn: { ...turn, status: 'errored' } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: /Turn 4/ }),
    ).toHaveTextContent('errored')
  },
}

/** A finished turn that changed nothing. */
export const Empty: Story = {
  args: { fileChanges: [], fileRows: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: /Turn 4/ }),
    ).toHaveTextContent('no changes')
  },
}

/** A summary longer than the card stays on one line. */
export const Long: Story = {
  args: {
    turn: {
      ...turn,
      sequence: 128,
      summary:
        'Moved every composer popover onto the shared Popover part, then chased three focus regressions through the picker containers',
    },
  },
}

export const Dark: Story = {
  ...Default,
  parameters: {},
  globals: { theme: 'dark' },
}

export const ExpandedDark: Story = {
  ...Expanded,
  name: 'Expanded, dark',
  globals: { theme: 'dark' },
}

export const ReducedMotion: Story = {
  ...Busy,
  globals: { motion: 'reduced' },
}
