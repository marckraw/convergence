import type { Meta, StoryObj } from '@storybook/react-vite'
import type { WorkspacePullRequest } from '@/entities/pull-request'
import { expect } from 'storybook/test'
import { PullRequestDetails } from './pull-request-details.presentational'

const openPullRequest: WorkspacePullRequest = {
  id: 'wpr-1',
  projectId: 'project-convergence',
  workspaceId: 'workspace-ds0',
  provider: 'github',
  lookupStatus: 'found',
  state: 'open',
  repositoryOwner: 'marckraw',
  repositoryName: 'convergence',
  number: 915,
  title: 'The design system is its own package',
  url: 'https://github.com/marckraw/convergence/pull/915',
  isDraft: false,
  headBranch: 'ui/ds0-package',
  baseBranch: 'master',
  mergedAt: null,
  lastCheckedAt: '2026-10-01T14:00:00.000Z',
  error: null,
  createdAt: '2026-09-30T09:00:00.000Z',
  updatedAt: '2026-10-01T14:00:00.000Z',
}

const meta = {
  title: 'Widgets/SessionView/PullRequestDetails',
  component: PullRequestDetails,
  args: { pullRequest: openPullRequest },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PullRequestDetails>

export default meta

type Story = StoryObj<typeof meta>

/** An open pull request for the workspace's branch. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('#915 open')).toBeVisible()
    await expect(canvas.getByText('marckraw/convergence')).toBeVisible()
    await expect(
      canvas.getByText('#915 The design system is its own package'),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Open in browser' }),
    ).toBeVisible()
  },
}

/** Merged: when, as well as what. */
export const Merged: Story = {
  args: {
    pullRequest: {
      ...openPullRequest,
      state: 'merged',
      mergedAt: '2026-10-01T13:30:00.000Z',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('#915 merged')).toBeVisible()
    await expect(canvas.getByText(/^Merged /)).toBeVisible()
  },
}

/** GitHub has no pull request for this branch. */
export const Empty: Story = {
  args: {
    pullRequest: {
      ...openPullRequest,
      lookupStatus: 'not-found',
      state: 'none',
      number: null,
      title: null,
      url: null,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No PR found')).toBeVisible()
    await expect(
      canvas.queryByRole('button', { name: 'Open in browser' }),
    ).toBeNull()
  },
}

/** A row an older build stored after a failed lookup. */
export const Failed: Story = {
  args: {
    pullRequest: {
      ...openPullRequest,
      lookupStatus: 'gh-auth-required',
      state: 'unknown',
      number: null,
      title: null,
      url: null,
      repositoryOwner: null,
      repositoryName: null,
      error: 'gh auth login is required before Convergence can read PRs.',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('gh auth needed')).toBeVisible()
    await expect(canvas.getByText('Unknown repository')).toBeVisible()
    await expect(canvas.getByText(/gh auth login is required/)).toBeVisible()
  },
}

/** A long title and branch names. */
export const Long: Story = {
  args: {
    pullRequest: {
      ...openPullRequest,
      state: 'draft',
      isDraft: true,
      title:
        'Every story is a test with an accessibility check, in light, dark and reduced motion, for every presentational part of the conversation',
      headBranch: 'ui/ds4-stories-conversation-and-mission-control',
      baseBranch: 'release/2026-10',
    },
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const MergedDark: Story = {
  ...Merged,
  name: 'Merged, dark',
  globals: { theme: 'dark' },
}
