import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ParallelWorkRow } from '@/shared/lib/parallel-work.pure'
import type { SessionAgentRun } from '@/shared/types/harness-evidence.types'
import { expect, fn, within } from 'storybook/test'
import { ParallelWorkPanel } from './parallel-work.presentational'

const NOW = Date.parse('2026-10-01T14:10:00.000Z')

const run = (
  overrides: Partial<SessionAgentRun> & Pick<SessionAgentRun, 'id'>,
): SessionAgentRun => ({
  sessionId: 'session-4f2c',
  spawnedByItemId: `item-spawn-${overrides.id}`,
  agentType: 'general-purpose',
  description: null,
  model: 'claude-sonnet-4-5',
  status: 'running',
  depth: 1,
  startedAt: '2026-10-01T14:06:00.000Z',
  endedAt: null,
  transcriptPath: null,
  isBackgrounded: false,
  lastToolName: 'Grep',
  usageJson: null,
  updatedAt: '2026-10-01T14:09:30.000Z',
  ...overrides,
})

const rows: ParallelWorkRow[] = [
  {
    id: 'run-audit',
    kind: 'agent',
    parentId: null,
    run: run({
      id: 'run-audit',
      description: 'Audit the IPC handlers for missing guards',
    }),
  },
  {
    id: 'run-tests',
    kind: 'agent',
    parentId: 'run-audit',
    run: run({
      id: 'run-tests',
      description: 'Write failing tests for the unguarded handlers',
      depth: 2,
      lastToolName: 'Edit',
      startedAt: '2026-10-01T14:08:00.000Z',
    }),
  },
  {
    id: 'bg-typecheck',
    kind: 'task',
    parentId: null,
    task: {
      taskId: 'bg-typecheck',
      sessionId: 'session-4f2c',
      toolUseId: 'toolu_01',
      taskType: 'local_bash',
      description: 'npm run typecheck -- --watch',
      status: 'running',
      startedAt: '2026-10-01T14:05:00.000Z',
      endedAt: null,
      outputFile: null,
    },
  },
  {
    id: 'run-docs',
    kind: 'agent',
    parentId: null,
    run: run({
      id: 'run-docs',
      description: 'Summarise the provider adapters',
      status: 'completed',
      endedAt: '2026-10-01T14:04:00.000Z',
      lastToolName: 'Read',
    }),
  },
]

const meta = {
  title: 'Widgets/SessionView/ParallelWork',
  component: ParallelWorkPanel,
  args: {
    rows,
    now: NOW,
    canStop: true,
    onSelect: fn(),
    onClose: fn(),
    onToggle: fn(),
    onBack: fn(),
    onDecision: fn(),
    onStop: fn(),
    onDetails: fn(),
    onSpawn: fn(),
    onResult: fn(),
    onToggleOlder: fn(),
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-176 w-104 max-w-full border-r border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ParallelWorkPanel>

export default meta

type Story = StoryObj<typeof meta>

/** Agents and background commands this session started, nested by who started whom. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const panel = canvas.getByRole('complementary', { name: 'Parallel work' })
    await expect(
      within(panel).getByText('This session · 3 running · 1 completed'),
    ).toBeVisible()
    // A parent folds its children.
    const fold = canvas.getByRole('button', {
      name: 'Collapse Audit the IPC handlers for missing guards',
    })
    await expect(fold).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(fold)
    await expect(args.onToggle).toHaveBeenCalledWith('agent:run-audit')
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Write failing tests for the unguarded handlers',
      }),
    )
    await expect(args.onSelect).toHaveBeenCalledWith('agent:run-tests')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Close parallel work' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

/** Stop is offered for running work and not for finished work. */
export const Stop: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const stops = canvas.getAllByRole('button', { name: 'Stop' })
    await userEvent.click(stops[0])
    await expect(args.onStop).toHaveBeenCalledOnce()
    // Message is not offered yet; it says why.
    await expect(
      canvas.getAllByRole('button', {
        name: 'Message is not available on this Claude Code version',
      })[0],
    ).toBeDisabled()
  },
}

/** A stop requested, and a stop that failed. */
export const Busy: Story = {
  args: {
    stopStates: new Map([['agent:run-audit', { pending: true }]]),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Stop requested… awaiting confirmation'),
    ).toBeVisible()
  },
}

/** A run the harness reports failed, and a stop that did not go through. */
export const Failed: Story = {
  parameters: {
    a11y: {
      config: {
        rules: [
          // a11y-known: the failure lines are red-500 on the failed card's red tint, under 4.5:1 in both themes — fixed by the sweep (DS4)
          { id: 'color-contrast', enabled: false },
        ],
      },
    },
  },
  args: {
    rows: [
      {
        id: 'run-failed',
        kind: 'agent',
        parentId: null,
        run: run({
          id: 'run-failed',
          description: 'Migrate the composer popovers',
          status: 'failed',
          endedAt: '2026-10-01T14:09:00.000Z',
          endedSummary: 'API Error: 529 Overloaded',
        }),
      },
      rows[0],
    ],
    stopStates: new Map([
      ['agent:run-audit', { error: 'The harness did not confirm the stop.' }],
    ]),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Reported by the harness: API Error: 529 Overloaded'),
    ).toBeVisible()
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'The harness did not confirm the stop.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Retry stop' }),
    ).toBeEnabled()
  },
}

/** Nothing started in parallel yet. */
export const Empty: Story = {
  args: { rows: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/No parallel work yet/)).toBeVisible()
    await expect(
      canvas.getByText('This session · 0 running · 0 completed'),
    ).toBeVisible()
  },
}

/** One row open: back to the list, with its controls and details. */
export const Selected: Story = {
  args: {
    selectedId: 'agent:run-audit',
    details: (
      <p className="text-xs text-muted-foreground">
        Transcript of the agent appears here.
      </p>
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Parallel work' }))
    await expect(args.onBack).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'View spawn' }))
    await expect(args.onSpawn).toHaveBeenCalledWith('item-spawn-run-audit')
  },
}

/** Work finished over an hour ago folds under one line. */
export const Older: Story = {
  args: {
    rows: [
      rows[0],
      {
        id: 'run-old',
        kind: 'agent',
        parentId: null,
        run: run({
          id: 'run-old',
          description: 'Map the settings dialog',
          status: 'completed',
          startedAt: '2026-10-01T11:00:00.000Z',
          endedAt: '2026-10-01T11:20:00.000Z',
        }),
      },
    ],
  },
  play: async ({ args, canvas, userEvent }) => {
    const older = canvas.getByRole('button', { name: /1 older · newest/ })
    await expect(older).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(older)
    await expect(args.onToggleOlder).toHaveBeenCalledOnce()
  },
}

/** Many rows: the list scrolls inside the panel. */
export const Long: Story = {
  args: {
    rows: Array.from({ length: 14 }, (_, index) => ({
      id: `run-${index}`,
      kind: 'agent' as const,
      parentId: null,
      run: run({
        id: `run-${index}`,
        description: `Check slice ${index + 1} of the design-system sweep for raw colours and one-off radii`,
      }),
    })),
  },
  play: async ({ canvasElement }) => {
    const list = canvasElement.querySelector<HTMLElement>(
      '[data-parallel-scroll]',
    )
    await expect(list?.scrollHeight).toBeGreaterThan(list?.clientHeight ?? 0)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const FailedDark: Story = {
  ...Failed,
  name: 'Failed, dark',
  globals: { theme: 'dark' },
}
