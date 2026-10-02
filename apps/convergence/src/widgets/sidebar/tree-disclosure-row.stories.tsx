import type { Meta, StoryObj } from '@storybook/react-vite'
import { Archive, GitBranch, MoreHorizontal } from 'lucide-react'
import { Badge, IconButton } from '@convergence/ui'
import { expect, fn } from 'storybook/test'
import { TreeDisclosureRow } from './tree-disclosure-row.presentational'

const meta = {
  title: 'Widgets/Sidebar/Tree disclosure row',
  component: TreeDisclosureRow,
  args: {
    title: 'feature/sidebar-overflow',
    icon: <GitBranch aria-hidden className="size-3 shrink-0" />,
    expanded: false,
    count: 3,
    onToggle: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-72 bg-canvas p-3 text-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TreeDisclosureRow>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A branch in the project tree: a click folds its sessions in or out, its
 * count at its end, its ⋯ menu shown with the row and for the keyboard.
 */
export const Default: Story = {
  args: {
    actions: (
      <IconButton label="Workspace actions feature/sidebar-overflow" size="xs">
        <MoreHorizontal className="h-3.5 w-3.5" />
      </IconButton>
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    const row = canvas.getByRole('button', {
      name: /^feature\/sidebar-overflow/,
    })
    await expect(row).toHaveTextContent('3')
    await userEvent.click(row)
    await expect(args.onToggle).toHaveBeenCalledOnce()
    // The ⋯ is out of sight until the row is hovered or focused, never out
    // of reach: Tab lands on it.
    await userEvent.tab()
    await expect(
      canvas.getByRole('button', {
        name: 'Workspace actions feature/sidebar-overflow',
      }),
    ).toHaveFocus()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A merged branch whose worktree is gone: both say so after its name. */
export const Merged: Story = {
  args: {
    expanded: true,
    marks: (
      <>
        <Badge hue="merged">Merged</Badge>
        <Badge>Worktree removed</Badge>
      </>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Merged')).toBeVisible()
    await expect(canvas.getByText('Worktree removed')).toBeVisible()
  },
}

/**
 * While a search holds every branch open, it can't fold: it is dimmed, a
 * click does nothing, and its tooltip says why.
 */
export const Disabled: Story = {
  args: {
    expanded: true,
    locked: true,
    tooltipDetail: 'Branches stay open while you search',
  },
  play: async ({ args, canvas }) => {
    const row = canvas.getByRole('button', {
      name: /^feature\/sidebar-overflow/,
    })
    await expect(row).toBeDisabled()
    await expect(row).toHaveAttribute(
      'data-tooltip-detail',
      'Branches stay open while you search',
    )
    row.click()
    await expect(args.onToggle).not.toHaveBeenCalled()
  },
}

/** The archived pile: its name says what a press does. */
export const Archived: Story = {
  args: {
    title: 'Archived',
    icon: <Archive aria-hidden className="size-3 shrink-0" />,
    tooltip: 'Archived workspaces and sessions',
    ariaLabel: 'Expand archived workspaces and sessions',
    count: 5,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', {
        name: 'Expand archived workspaces and sessions',
      }),
    ).toBeVisible()
  },
}

/** A long branch name is cut short; the count and the badge keep their place. */
export const Long: Story = {
  args: {
    title:
      'feature/an-extremely-long-branch-name-for-the-sidebar-overflow-on-small-windows',
    marks: <Badge hue="merged">Merged</Badge>,
  },
  play: async ({ canvas }) => {
    const row = canvas.getByRole('button', { name: /^feature\/an-extremely/ })
    await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
    await expect(canvas.getByText('Merged')).toBeVisible()
  },
}
