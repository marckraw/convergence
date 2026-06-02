import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pullRequestReviewApi } from './pull-request-review.api'

describe('pullRequestReviewApi', () => {
  let previewReview: ReturnType<typeof vi.fn>
  let prepareReviewSession: ReturnType<typeof vi.fn>
  let materializeReviewWorkspace: ReturnType<typeof vi.fn>

  beforeEach(() => {
    previewReview = vi.fn()
    prepareReviewSession = vi.fn()
    materializeReviewWorkspace = vi.fn()

    Object.defineProperty(window, 'electronAPI', {
      value: {
        pullRequest: {
          previewReview,
          prepareReviewSession,
          materializeReviewWorkspace,
        },
      },
      configurable: true,
    })
  })

  it('forwards materializeReviewWorkspace to the preload bridge', async () => {
    const result = {
      workspace: {
        id: 'workspace-1',
        projectId: 'project-1',
        branchName: 'convergence/pr-123',
        path: '/repo/.worktrees/pr-123',
        type: 'worktree',
        archivedAt: null,
        worktreeRemovedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      pullRequest: {
        id: 'pr-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        provider: 'github',
        lookupStatus: 'found',
        state: 'open',
        repositoryOwner: 'acme',
        repositoryName: 'app',
        number: 123,
        title: 'Feature',
        url: 'https://github.com/acme/app/pull/123',
        isDraft: false,
        headBranch: 'feature',
        baseBranch: 'main',
        mergedAt: null,
        lastCheckedAt: '2026-01-01T00:00:00.000Z',
        error: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      created: true,
      refreshed: false,
    }
    materializeReviewWorkspace.mockResolvedValue(result)

    await expect(
      pullRequestReviewApi.materializeReviewWorkspace({
        projectId: 'project-1',
        reference: '123',
      }),
    ).resolves.toEqual(result)

    expect(materializeReviewWorkspace).toHaveBeenCalledWith({
      projectId: 'project-1',
      reference: '123',
    })
  })
})
