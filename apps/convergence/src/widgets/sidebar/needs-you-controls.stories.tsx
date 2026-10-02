import type { Meta, StoryObj } from '@storybook/react-vite'
import type { SessionSummary } from '@/entities/session'
import {
  buildFeedView,
  defaultFeedView,
  groupNeedsYou,
  needsYouCardModel,
  type FeedView,
} from '@/features/needs-you'
import { expect, fn, within } from 'storybook/test'
import { NeedsYouControls } from './needs-you-controls.presentational'

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

const groups = groupNeedsYou(
  [
    session({
      id: 'overflow',
      name: 'Fix the sidebar overflow',
      status: 'running',
      attention: 'needs-approval',
    }),
    session({
      id: 'release',
      name: 'Release notes for 0.98',
      providerId: 'codex',
      attention: 'needs-input',
    }),
    session({
      id: 'fast-tier',
      name: 'Codex fast tier',
      providerId: 'codex',
      attention: 'finished',
    }),
    session({
      id: 'stories',
      name: 'Safety-net stories',
      status: 'running',
      executionHost: 'little-monster',
    }),
    session({
      id: 'sweep',
      name: 'Design system sweep',
      attention: 'finished',
      pinnedAt: '2026-09-29T18:00:00.000Z',
    }),
  ].map((item) =>
    needsYouCardModel(item, {
      projectName: 'convergence',
      endpoints: [{ id: 'little-monster', label: 'little-monster' }],
      now,
    }),
  ),
)

const view = defaultFeedView()
const needsMe: FeedView = { ...view, activities: ['needs-me'] }

const meta = {
  title: 'Widgets/Sidebar/Needs you controls',
  component: NeedsYouControls,
  args: {
    controlsId: 'activity-filters',
    // A callback ref: a ref object here would carry a DOM node between stories.
    triggerRef: () => undefined,
    expanded: false,
    view,
    result: buildFeedView(groups, view),
    onToggle: fn(),
    onCollapse: fn(),
    onChange: fn(),
    onReset: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-80 bg-canvas p-3 text-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NeedsYouControls>

export default meta

type Story = StoryObj<typeof meta>

/** Folded: the count, and one button that says what the feed shows. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', {
      name: 'Edit activity filters: All activity; All hosts · All providers; Order: Created (newest first)',
    })
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).toHaveAttribute('aria-controls', 'activity-filters')
    await expect(
      canvas.queryByRole('group', { name: 'Activity view' }),
    ).toBeNull()
    await userEvent.click(trigger)
    await expect(args.onToggle).toHaveBeenCalledOnce()
    await expect(
      canvas.queryByRole('button', { name: 'Clear activity filters' }),
    ).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Open: every filter is a toggle that says whether it is on. */
export const Expanded: Story = {
  args: { expanded: true },
  play: async ({ args, canvas, userEvent }) => {
    const activity = canvas.getByRole('group', { name: 'Activity view' })
    await expect(
      within(activity).getByRole('button', { name: 'All activity' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(
      within(activity).getByRole('button', { name: 'Needs you' }),
    )
    await expect(args.onChange).toHaveBeenLastCalledWith(needsMe)

    const hosts = canvas.getByRole('group', { name: 'Host filters' })
    await userEvent.click(
      within(hosts).getByRole('button', { name: 'Remote · All remote hosts' }),
    )
    await expect(args.onChange).toHaveBeenLastCalledWith({
      ...view,
      hosts: ['remote'],
    })

    const order = canvas.getByRole('group', { name: 'Order by' })
    await userEvent.click(within(order).getByRole('button', { name: 'Name' }))
    await expect(args.onChange).toHaveBeenLastCalledWith({
      ...view,
      order: 'name',
    })

    await userEvent.click(
      canvas.getByRole('button', { name: 'Collapse filters' }),
    )
    await expect(args.onCollapse).toHaveBeenCalledOnce()
  },
}

export const ExpandedDark: Story = {
  ...Expanded,
  name: 'Expanded, dark',
  globals: { theme: 'dark' },
}

/** Filtered: how many of all are shown, and a way to clear the filters. */
export const Filtered: Story = {
  args: {
    expanded: true,
    view: needsMe,
    result: buildFeedView(groups, needsMe),
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('2 of 5')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Needs you' }),
    ).toHaveAttribute('aria-pressed', 'true')
    // The pinned card is not lost: the feed says the filters hide it.
    await expect(
      canvas.getByText('1 pinned card hidden by filters.'),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Clear activity filters' }),
    )
    await expect(args.onReset).toHaveBeenCalledOnce()
  },
}

/** No activity yet: the feed says so, as a status. */
export const Empty: Story = {
  args: { result: buildFeedView([], view) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'No activity cards yet.',
    )
  },
}

/** A name search that matches nothing says what it searched for. */
export const NoMatch: Story = {
  name: 'No match',
  args: {
    nameSearchQuery: 'zeppelin',
    result: buildFeedView([], view),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('zeppelin')
  },
}

/** Reduced motion: the summary's chevron turns without a transition. */
export const ReducedMotion: Story = {
  args: { expanded: true },
  globals: { motion: 'reduced' },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', {
      name: /^Collapse activity filters/,
    })
    const chevrons = trigger.querySelectorAll('svg')
    const chevron = chevrons[chevrons.length - 1]
    await expect(getComputedStyle(chevron).transitionProperty).toBe('none')
  },
}
