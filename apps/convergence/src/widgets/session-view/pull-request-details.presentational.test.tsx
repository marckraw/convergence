import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { WorkspacePullRequest } from '@/entities/pull-request'
import { PullRequestDetails } from './pull-request-details.presentational'

/**
 * The legacy lookup statuses are rows, not code paths (MAR-2991).
 *
 * Nothing writes `gh-unavailable` / `gh-auth-required` / `unsupported-remote` /
 * `error` into `workspace_pull_requests` any more — MAR-2978 lap 3 gated the
 * upsert on an answered lookup — but earlier builds did, and those rows are
 * durable. This renders one of them through the real component: the drawer
 * still names what the row says instead of falling through to the raw state.
 *
 * Mutation: delete the `gh-unavailable` arm of `statusLabel` and this goes red
 * ('unknown', the state, would be shown instead).
 */
const LEGACY_ROW: WorkspacePullRequest = {
  id: 'wpr-1',
  projectId: 'p-1',
  workspaceId: 'w-1',
  provider: 'github',
  lookupStatus: 'gh-unavailable',
  state: 'unknown',
  repositoryOwner: 'acme',
  repositoryName: 'app',
  number: null,
  title: null,
  url: null,
  isDraft: false,
  headBranch: 'agent/legacy',
  baseBranch: null,
  mergedAt: null,
  lastCheckedAt: '2026-09-09T11:00:00.000Z',
  error: null,
  createdAt: '2026-09-09T11:00:00.000Z',
  updatedAt: '2026-09-09T11:00:00.000Z',
}

it('names a legacy gh-unavailable row rather than showing its bare state', () => {
  render(<PullRequestDetails pullRequest={LEGACY_ROW} />)

  expect(screen.getByText('gh unavailable')).toBeInTheDocument()
})
