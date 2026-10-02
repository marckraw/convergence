import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import type { TrackerOutsideIssue } from '@/shared/types/tracker.types'
import { LoomOutsideGroupView } from './loom-outside.presentational'
import { loomOutsideView } from './loom-outside.pure'

const AT = '2026-09-17T12:00:00.000Z'

const issue = (
  n: number,
  title: string,
  overrides: Partial<TrackerOutsideIssue> = {},
): TrackerOutsideIssue => ({
  id: `issue-${n}`,
  identifier: `MAR-${n}`,
  title,
  url: `https://linear.app/example/issue/mar-${n}`,
  status: 'Backlog',
  priority: null,
  labels: [],
  updatedAt: AT,
  ...overrides,
})

const issues = [
  issue(3300, 'Settings: one search across every pane', {
    labels: ['area › settings'],
  }),
  issue(3301, 'Composer: paste an image from the clipboard', {
    status: 'Todo',
    updatedAt: '2026-09-17T11:00:00.000Z',
  }),
]

const meta = {
  title: 'Features/Waves/LoomOutside',
  component: LoomOutsideGroupView,
  args: {
    view: loomOutsideView({
      crewId: 'crew-1',
      readAt: AT,
      more: false,
      issues,
    }),
    open: false,
    onToggle: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-80 rounded-xl bg-surface p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LoomOutsideGroupView>

export default meta

type Story = StoryObj<typeof meta>

/** Folded: one line, and the rows are absent from the page, not hidden. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const group = canvas.getByRole('region', { name: 'Not in the loop' })
    const toggle = within(group).getByRole('button', {
      name: 'Not in the loop · 2',
    })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(within(group).queryAllByRole('link')).toHaveLength(0)
    await userEvent.click(toggle)
    await expect(args.onToggle).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Open: the project's other issues, newest first, each a link to Linear. */
export const Open: Story = {
  args: { open: true },
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole('button', { name: 'Not in the loop · 2' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveAttribute(
      'aria-controls',
      'loom-not-in-the-loop',
    )
    const links = canvas.getAllByRole('link')
    await expect(links).toHaveLength(2)
    await expect(links[0]).toHaveTextContent('MAR-3300')
    await expect(links[0]).toHaveAttribute(
      'href',
      'https://linear.app/example/issue/mar-3300',
    )
    await expect(links[0]).toHaveAttribute('target', '_blank')
  },
}

export const OpenDark: Story = {
  ...Open,
  globals: { theme: 'dark' },
}

/** More than one read holds: the list says it was cut short. */
export const Long: Story = {
  args: {
    open: true,
    view: loomOutsideView({ crewId: 'crew-1', readAt: AT, more: true, issues }),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Not in the loop · 2+' }),
    ).toBeVisible()
  },
}

/** Every open issue carries a Loom label: nothing to unfold. */
export const Empty: Story = {
  args: {
    view: loomOutsideView({
      crewId: 'crew-1',
      readAt: AT,
      more: false,
      issues: [],
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).toBeNull()
    await expect(canvas.getByText('Not in the loop · 0')).toBeVisible()
  },
}

/** Never read yet: the title says so, and there is nothing to open. */
export const Busy: Story = {
  args: { view: loomOutsideView(null) },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Not in the loop · not read yet'),
    ).toBeVisible()
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}
