import type { Meta, StoryObj } from '@storybook/react-vite'
import type { SessionSummary } from '@/entities/session'
import {
  buildFeedView,
  defaultFeedView,
  groupNeedsYou,
  needsYouCardModel,
} from '@/features/needs-you'
import { TooltipProvider } from '@convergence/ui'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { NeedsYou } from './needs-you.presentational'

const now = Date.parse('2026-09-30T09:30:00.000Z')

const session = (
  overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id' | 'name'>,
): SessionSummary => ({
  contextKind: 'project',
  projectId: 'convergence',
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
  originKind: 'resident',
  pinnedAt: null,
  ...overrides,
})

const sessions: SessionSummary[] = [
  session({
    id: 'sweep',
    name: 'Design system sweep',
    attention: 'finished',
    pinnedAt: '2026-09-29T18:00:00.000Z',
  }),
  session({
    id: 'overflow',
    name: 'Fix the sidebar overflow',
    status: 'running',
    attention: 'needs-approval',
    attentionRequestKind: 'approval',
    updatedAt: '2026-09-30T09:28:00.000Z',
  }),
  session({
    id: 'release',
    name: 'Release notes for 0.98',
    providerId: 'codex',
    model: 'gpt-5.5',
    attention: 'needs-input',
    updatedAt: '2026-09-30T09:25:00.000Z',
  }),
  session({
    id: 'fast-tier',
    name: 'Codex fast tier reaches the next turn',
    providerId: 'codex',
    model: 'gpt-5.5',
    attention: 'finished',
    updatedAt: '2026-09-30T09:10:00.000Z',
  }),
  session({
    id: 'stories',
    name: 'Safety-net stories',
    status: 'running',
    activity: 'streaming',
    updatedAt: '2026-09-30T09:29:00.000Z',
  }),
]

const groupsOf = (list: SessionSummary[]) =>
  buildFeedView(
    groupNeedsYou(
      list.map((item) =>
        needsYouCardModel(item, {
          projectName: 'convergence',
          endpoints: [],
          now,
        }),
      ),
    ),
    defaultFeedView(),
  ).groups

const meta = {
  title: 'Widgets/Sidebar/Needs you',
  component: NeedsYou,
  args: {
    groups: groupsOf(sessions),
    activeSessionId: 'stories',
    onToggleFold: fn(),
    onSelect: fn(),
    onPin: fn(),
    onDismiss: fn(),
    onArchive: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="w-80 bg-canvas pt-3 text-ink">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof NeedsYou>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The Activity feed: Pinned, then what asks for you, then what is ready for
 * review, then what is still running. Each section folds by its title.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const titles = canvas
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label'))
    await expect(titles).toEqual(['Pinned', 'Needs you', 'Review', 'Working'])

    const asks = canvas.getByRole('region', { name: 'Needs you' })
    await userEvent.click(
      within(asks).getByRole('button', { name: /^Fix the sidebar overflow/ }),
    )
    await expect(args.onSelect).toHaveBeenCalledWith('overflow')

    const fold = within(asks).getByRole('button', { name: 'Needs you' })
    await expect(fold).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(fold)
    await expect(args.onToggleFold).toHaveBeenCalledWith('Needs you')

    // The open conversation is marked as the current one.
    await expect(
      canvas.getByRole('button', { name: /^Safety-net stories/ }),
    ).toHaveAttribute('aria-current', 'true')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * Folded sections hide their cards; the title row keeps one glyph per card,
 * named on hover, and a second line says what still asks.
 */
export const Folded: Story = {
  args: { foldedTitles: new Set(['Needs you', 'Working']) },
  play: async ({ canvas, userEvent }) => {
    const asks = canvas.getByRole('region', { name: 'Needs you' })
    await expect(
      within(asks).getByRole('button', { name: 'Needs you' }),
    ).toHaveAttribute('aria-expanded', 'false')
    await expect(
      within(asks).queryByRole('button', { name: /^Fix the sidebar overflow/ }),
    ).toBeNull()
    // The second line says what still asks, in words, and where.
    await expect(within(asks).getByText('2 waiting on you')).toBeVisible()
    await expect(within(asks).getByText('convergence')).toBeVisible()
    const glyphs = within(asks).getByRole('img', {
      name: 'Fix the sidebar overflow, Release notes for 0.98',
    })
    await userEvent.hover(glyphs)
    const tooltip = await screen.findByRole('tooltip')
    await expect(
      within(tooltip).getByText('Release notes for 0.98'),
    ).toBeInTheDocument()
    await userEvent.unhover(glyphs)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())

    // An open section is unchanged beside them.
    await expect(
      within(canvas.getByRole('region', { name: 'Review' })).getByRole(
        'button',
        { name: /^Codex fast tier/ },
      ),
    ).toBeVisible()
  },
}

/** Reduced motion: a fold's chevron turns without a transition. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvas }) => {
    const fold = canvas.getByRole('button', { name: 'Review' })
    const chevron = fold.querySelector('svg')
    await expect(chevron).not.toBeNull()
    await expect(getComputedStyle(chevron as Element).transitionProperty).toBe(
      'none',
    )
  },
}

/** Long names wrap inside their card; many cards stack in the feed. */
export const Long: Story = {
  args: {
    groups: groupsOf(
      Array.from({ length: 8 }, (_, index) =>
        session({
          id: `long-${index}`,
          name: `A conversation about the sidebar's project list overflowing below nine hundred pixels, part ${index + 1}`,
          attention: index % 2 ? 'finished' : 'needs-input',
          updatedAt: `2026-09-30T09:${String(10 + index).padStart(2, '0')}:00.000Z`,
        }),
      ),
    ),
    activeSessionId: null,
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getAllByRole('button', { name: /^A conversation about/ }),
    ).toHaveLength(8)
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth,
    )
  },
}

/** Nothing in the feed: no sections at all. */
export const Empty: Story = {
  args: { groups: [] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('region')).toBeNull()
  },
}
