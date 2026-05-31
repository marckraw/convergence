import { beforeEach, describe, expect, it, vi } from 'vitest'
import { codeReviewApi } from './code-review.api'
import type { CodeReviewSummary } from './code-review.types'

const target = {
  id: 'session:session-1',
  projectId: 'project-1',
  projectName: 'Project',
  sessionId: 'session-1',
  repositoryPath: '/repo',
  workspaceId: 'workspace-1',
  sessionName: 'Implement feature',
  branchName: 'feature',
  pullRequestId: null,
  pullRequestLabel: null,
  source: 'session' as const,
  updatedAt: '2026-01-02T00:00:00.000Z',
  status: {
    workingTreeFileCount: 1,
    workingTreeStatusCounts: { M: 1 },
    error: null,
  },
}

const cacheIdentity = {
  comparisonRef: 'origin/main',
  comparisonPoint: 'merge-base-1',
  workingTreeVersionToken: 'wt-1',
}

describe('codeReviewApi', () => {
  let listTargets: ReturnType<typeof vi.fn>
  let getSummary: ReturnType<typeof vi.fn>
  let getFilePatch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    listTargets = vi.fn()
    getSummary = vi.fn()
    getFilePatch = vi.fn()

    Object.defineProperty(window, 'electronAPI', {
      value: {
        codeReview: {
          listTargets,
          getSummary,
          getFilePatch,
        },
      },
      configurable: true,
    })
  })

  it('forwards listTargets to the preload bridge', async () => {
    listTargets.mockResolvedValue([target])

    await expect(
      codeReviewApi.listTargets({ projectId: 'project-1' }),
    ).resolves.toEqual([target])

    expect(listTargets).toHaveBeenCalledWith({ projectId: 'project-1' })
  })

  it('forwards getSummary to the preload bridge', async () => {
    const summary: CodeReviewSummary = {
      base: null,
      cacheIdentity,
      files: [{ status: 'M', file: 'src/app.ts' }],
    }
    getSummary.mockResolvedValue(summary)

    await expect(
      codeReviewApi.getSummary({ target, mode: 'working-tree' }),
    ).resolves.toEqual(summary)

    expect(getSummary).toHaveBeenCalledWith({ target, mode: 'working-tree' })
  })

  it('forwards getFilePatch to the preload bridge', async () => {
    getFilePatch.mockResolvedValue('diff body')

    await expect(
      codeReviewApi.getFilePatch({
        target,
        mode: 'base-branch',
        filePath: 'src/app.ts',
        cacheIdentity,
      }),
    ).resolves.toBe('diff body')

    expect(getFilePatch).toHaveBeenCalledWith({
      target,
      mode: 'base-branch',
      filePath: 'src/app.ts',
      cacheIdentity,
    })
  })
})
