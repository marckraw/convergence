import { beforeEach, describe, expect, it, vi } from 'vitest'
import { codeReviewGuideApi } from './code-review-guide.api'
import type { CodeReviewGuide } from './code-review-guide.types'

describe('codeReviewGuideApi', () => {
  let getGuide: ReturnType<typeof vi.fn>
  let generateGuide: ReturnType<typeof vi.fn>
  let refreshGuide: ReturnType<typeof vi.fn>
  let testRemoteDaemonConnection: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getGuide = vi.fn()
    generateGuide = vi.fn()
    refreshGuide = vi.fn()
    testRemoteDaemonConnection = vi.fn()

    Object.defineProperty(window, 'electronAPI', {
      value: {
        codeReviewGuide: {
          getGuide,
          generateGuide,
          refreshGuide,
          testRemoteDaemonConnection,
        },
      },
      configurable: true,
    })
  })

  it('forwards guide calls to the preload bridge', async () => {
    const input = makeLookup()
    const guide = makeGuide()
    const connection = {
      ok: true,
      state: 'connected' as const,
      baseUrl: 'https://daemon.example.com',
      message: 'Connected to agents-daemon.',
      health: null,
      meta: null,
    }
    getGuide.mockResolvedValue(guide)
    generateGuide.mockResolvedValue(guide)
    refreshGuide.mockResolvedValue(guide)
    testRemoteDaemonConnection.mockResolvedValue(connection)

    await expect(codeReviewGuideApi.getGuide(input)).resolves.toEqual(guide)
    await expect(
      codeReviewGuideApi.generateGuide({ ...input, files: [] }),
    ).resolves.toEqual(guide)
    await expect(
      codeReviewGuideApi.refreshGuide({ ...input, files: [] }),
    ).resolves.toEqual(guide)
    await expect(
      codeReviewGuideApi.testRemoteDaemonConnection(),
    ).resolves.toEqual(connection)

    expect(getGuide).toHaveBeenCalledWith(input)
    expect(generateGuide).toHaveBeenCalledWith({ ...input, files: [] })
    expect(refreshGuide).toHaveBeenCalledWith({ ...input, files: [] })
    expect(testRemoteDaemonConnection).toHaveBeenCalledWith()
  })
})

function makeLookup() {
  return {
    target: {
      id: 'session:session-1',
      projectId: 'project-1',
      projectName: 'Project',
      repositoryPath: '/repo',
      workspaceId: null,
      sessionId: 'session-1',
      sessionName: 'Session',
      branchName: 'feature',
      pullRequestId: null,
      pullRequestNumber: null,
      pullRequestLabel: null,
      pullRequestUrl: null,
      pullRequestBaseBranch: null,
      pullRequestHeadBranch: null,
      source: 'session' as const,
      updatedAt: null,
      status: {
        workingTreeFileCount: 0,
        workingTreeStatusCounts: {},
        error: null,
      },
    },
    mode: 'working-tree' as const,
    cacheIdentity: {
      comparisonRef: null,
      comparisonPoint: null,
      workingTreeVersionToken: 'wt-1',
    },
  }
}

function makeGuide(): CodeReviewGuide {
  return {
    id: 'guide-1',
    projectId: 'project-1',
    targetId: 'session:session-1',
    mode: 'working-tree',
    cacheIdentity: makeLookup().cacheIdentity,
    status: 'ready',
    overview: 'Overview',
    generatedBy: 'deterministic',
    sections: [],
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
