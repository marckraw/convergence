import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { PullRequestPanel } from './pull-request-panel.presentational'

const meta = {
  title: 'Widgets/SessionView/PullRequestPanel',
  component: PullRequestPanel,
  args: {
    pullRequest: {
      number: 915,
      url: 'https://github.com/marckraw/convergence/pull/915',
      state: 'open',
      headBranch: 'ui/ds0-package',
      checkedAt: '2026-10-01T14:00:00.000Z',
      source: 'gh',
      title: 'The design system is its own package',
    },
    branchName: 'ui/ds0-package',
    loading: false,
    error: null,
    onRefresh: fn(),
    onClose: fn(),
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-[30rem] justify-end bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PullRequestPanel>

export default meta

type Story = StoryObj<typeof meta>

/** The session's branch and the pull request GitHub knows for it. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('#915 · open')).toBeVisible()
    await expect(
      canvas.getByText('https://github.com/marckraw/convergence/pull/915'),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Open in browser' }),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Refresh PR status' }),
    )
    await expect(args.onRefresh).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Close pull request panel' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

/** A branch, but nothing cached about its pull request yet. */
export const Unchecked: Story = {
  args: { pullRequest: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/No PR status cached yet/)).toBeVisible()
  },
}

/** No branch was recorded for this session. */
export const Empty: Story = {
  args: { pullRequest: null, branchName: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('no branch recorded for this session'),
    ).toBeVisible()
  },
}

/** Asking GitHub: Refresh waits for the answer. */
export const Busy: Story = {
  args: { pullRequest: null, loading: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Refresh PR status' }),
    ).toBeDisabled()
  },
}

/** The lookup failed. */
export const Failed: Story = {
  parameters: {
    a11y: {
      config: {
        rules: [
          // a11y-known: the error text is destructive on a 10% destructive tint, 4.28:1 in light — fixed by the sweep (DS4)
          { id: 'color-contrast', enabled: false },
        ],
      },
    },
  },
  args: {
    pullRequest: null,
    error: 'gh: authentication required. Run `gh auth login` and refresh.',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/gh: authentication required/)).toBeVisible()
  },
}

/** A long branch name is cut short; a long URL wraps. */
export const Long: Story = {
  args: {
    branchName:
      'agent/mar-3572-fast-reaches-next-turn-of-an-open-conversation-with-codex',
    pullRequest: {
      number: 1204,
      url: 'https://github.com/marckraw/convergence/pull/1204/files#diff-3f1c0a9e7b2d4c5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7081',
      state: 'merged',
      headBranch:
        'agent/mar-3572-fast-reaches-next-turn-of-an-open-conversation-with-codex',
      checkedAt: '2026-10-01T14:00:00.000Z',
      source: 'daemon',
    },
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
