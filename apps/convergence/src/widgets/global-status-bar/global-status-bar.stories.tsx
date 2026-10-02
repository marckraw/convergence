import type { Meta, StoryObj } from '@storybook/react-vite'
import type {
  ProjectActivity,
  ProviderInfo,
  SessionSummary,
} from '@/entities/session'
import type { AgentMeterSnapshot } from '@/shared/types/agent-meter.types'
import { TooltipProvider } from '@convergence/ui'
import { expect, fn, screen, within } from 'storybook/test'
import { GlobalStatusBar } from './global-status-bar.presentational'

const session = (
  overrides: Partial<SessionSummary> &
    Pick<SessionSummary, 'id' | 'name' | 'projectId'>,
): SessionSummary => ({
  contextKind: 'project',
  workspaceId: null,
  providerId: 'claude-code',
  model: 'claude-opus-4-5',
  effort: null,
  status: 'idle',
  attention: 'none',
  activity: null,
  contextWindow: null,
  workingDirectory: '~/Projects/Private/convergence',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 12,
  createdAt: '2026-09-30T08:00:00.000Z',
  updatedAt: '2026-09-30T09:20:00.000Z',
  executionHost: 'local',
  ...overrides,
})

const provider = (
  id: string,
  name: string,
  vendorLabel: string,
): ProviderInfo => ({
  id,
  name,
  vendorLabel,
  kind: 'conversation',
  supportsContinuation: true,
  supportsConversationReset: false,
  defaultModelId: 'default',
  modelOptions: [],
  attachments: {
    supportsImage: true,
    supportsPdf: true,
    supportsText: true,
    maxImageBytes: 10 * 1024 * 1024,
    maxPdfBytes: 20 * 1024 * 1024,
    maxTextBytes: 1024 * 1024,
    maxTotalBytes: 50 * 1024 * 1024,
  },
  midRunInput: {
    supportsAnswer: true,
    supportsNativeFollowUp: true,
    supportsAppQueuedFollowUp: true,
    supportsSteer: false,
    supportsInterrupt: true,
    defaultRunningMode: 'follow-up',
  },
})

const providers = [
  provider('claude-code', 'Claude Code', 'Anthropic'),
  provider('codex', 'Codex', 'OpenAI'),
]

const stories = session({
  id: 'stories',
  name: 'Safety-net stories',
  projectId: 'convergence',
  status: 'running',
  activity: 'tool:Bash',
})
const overflow = session({
  id: 'overflow',
  name: 'Fix the sidebar overflow',
  projectId: 'convergence',
  status: 'running',
  attention: 'needs-approval',
})
const release = session({
  id: 'release',
  name: 'Release notes for 0.98',
  projectId: 'emergence',
  providerId: 'codex',
  status: 'running',
  activity: 'thinking',
  executionHost: 'little-monster',
})

const byProject: ProjectActivity[] = [
  {
    projectId: 'convergence',
    projectName: 'convergence',
    running: [stories],
    needsAttention: [overflow],
    providerIds: ['claude-code'],
  },
  {
    projectId: 'emergence',
    projectName: 'emergence',
    running: [release],
    needsAttention: [],
    providerIds: ['codex'],
  },
]

const meter: AgentMeterSnapshot = {
  agents: { cpu: 34, memoryMb: 1840 },
  convergence: { cpu: 6, memoryMb: 420 },
  rows: [
    { sessionId: 'stories', account: null, usage: { cpu: 28, memoryMb: 1210 } },
    {
      sessionId: 'overflow',
      account: 'work',
      usage: { cpu: 6, memoryMb: 630 },
    },
  ],
}

const meta = {
  title: 'Widgets/Global status bar/Global status bar',
  component: GlobalStatusBar,
  args: {
    meter,
    meterSessions: [stories, overflow, release],
    runningCount: 3,
    attentionCount: 1,
    byProject,
    recency: {
      session: {
        ...session({
          id: 'fast-tier',
          name: 'Codex fast tier',
          projectId: 'convergence',
          providerId: 'codex',
          attention: 'finished',
        }),
        projectId: 'convergence',
      },
      projectName: 'convergence',
      kind: 'completed',
    },
    providers,
    onSelectProject: fn(),
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="flex h-40 flex-col justify-end bg-canvas">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof GlobalStatusBar>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The window's last line: how many run and how many need you, a chip per
 * busy project, the agents' footprint, and the last session to finish.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    // One waits on you, and the count says so in the singular (NAV-32).
    await expect(canvas.getByText('needs you')).toBeVisible()
    const chip = canvas.getByRole('button', {
      name: 'Switch to project convergence, 1 running, 1 approval',
    })
    await userEvent.click(chip)
    await expect(args.onSelectProject).toHaveBeenCalledWith('convergence')

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Switch to project emergence, 1 running',
      }),
    )
    await expect(args.onSelectProject).toHaveBeenLastCalledWith('emergence')

    const recency = canvas.getByRole('button', {
      name: 'Switch to project convergence',
    })
    await expect(recency).toHaveTextContent('Codex fast tier')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A project chip's tooltip lists what runs and what asks, by provider. */
export const ProjectTooltip: Story = {
  name: 'Project tooltip',
  play: async ({ canvas, userEvent }) => {
    const chip = canvas.getByRole('button', {
      name: /^Switch to project convergence, 1 running/,
    })
    await userEvent.hover(chip)
    const tooltip = await screen.findByRole('tooltip')
    await expect(
      within(tooltip).getByText('Fix the sidebar overflow'),
    ).toBeInTheDocument()
    await expect(
      within(tooltip).getByText('· Approval needed'),
    ).toBeInTheDocument()
    await expect(within(tooltip).getByText('· tool: Bash')).toBeInTheDocument()
    await expect(within(tooltip).getAllByText('· Anthropic')).toHaveLength(2)
  },
}

/**
 * The counts' tooltip sums up every busy project. The counts are a stop for
 * the keyboard too, so Tab opens the same summary the pointer does (NAV-26).
 */
export const AggregateTooltip: Story = {
  name: 'Aggregate tooltip',
  play: async ({ canvas, userEvent }) => {
    const counts = canvas.getByRole('group', {
      name: 'Agents: 3 running, 1 needs you',
    })
    await userEvent.tab()
    await expect(counts).toHaveFocus()
    const tooltip = await screen.findByRole('tooltip')
    await expect(
      within(tooltip).getByText('1 running · 1 approval · Anthropic'),
    ).toBeInTheDocument()
    await expect(
      within(tooltip).getByText('1 running · 0 need you · OpenAI'),
    ).toBeInTheDocument()
  },
}

/** The meter's tooltip: each metered agent, busiest first, and remote ones. */
export const MeterTooltip: Story = {
  name: 'Meter tooltip',
  play: async ({ canvas }) => {
    const total = canvas.getByText(/^Agents 34% · 1\.8 GB/)
    total.focus()
    await expect(total).toHaveFocus()
    const tooltip = await screen.findByRole('tooltip')
    const rows = within(tooltip).getAllByText(/ · /)
    await expect(rows[0]).toHaveTextContent('Safety-net stories · 28% · 1.2 GB')
    await expect(
      within(tooltip).getByText('Release notes for 0.98 · remote'),
    ).toBeInTheDocument()
  },
}

/** The last session failed: the same badge, in the failure's colour. */
export const Failed: Story = {
  args: {
    recency: {
      session: {
        ...session({
          id: 'broken',
          name: 'Migrate the settings store',
          projectId: 'emergence',
          status: 'failed',
          attention: 'failed',
        }),
        projectId: 'emergence',
      },
      projectName: 'emergence',
      kind: 'failed',
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    const badge = canvas.getByRole('button', {
      name: 'Switch to project emergence',
    })
    await expect(badge).toHaveTextContent('Migrate the settings store')
    await userEvent.hover(badge)
    await expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /Failed · Anthropic/,
    )
    await userEvent.click(badge)
    await expect(args.onSelectProject).toHaveBeenCalledWith('emergence')
  },
}

/** Nothing running anywhere: one quiet line. */
export const Empty: Story = {
  args: {
    runningCount: 0,
    attentionCount: 0,
    byProject: [],
    recency: null,
    meter: undefined,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No agents running')).toBeVisible()
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/** Many busy projects: the chips stay on the one line the bar has. */
export const Long: Story = {
  args: {
    runningCount: 12,
    byProject: Array.from({ length: 12 }, (_, index) => ({
      projectId: `project-${index}`,
      projectName: `client-project-with-a-long-name-${index + 1}`,
      running: [
        session({
          id: `running-${index}`,
          name: `Conversation ${index + 1}`,
          projectId: `project-${index}`,
          status: 'running',
        }),
      ],
      needsAttention: [],
      providerIds: ['claude-code'],
    })),
  },
  play: async ({ canvas }) => {
    const chips = canvas.getAllByRole('button', {
      name: /^Switch to project client-project/,
    })
    await expect(chips).toHaveLength(12)
    const bar = chips[0].closest('[data-testid="global-status-bar"]')
    await expect(bar?.getBoundingClientRect().height).toBe(28)
  },
}
