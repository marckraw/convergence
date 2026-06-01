import { beforeEach, describe, expect, it, vi } from 'vitest'
import { codeReviewGuideApi } from './code-review-guide.api'
import { buildCodeReviewGuideKey } from './code-review-guide.pure'
import { useCodeReviewGuideStore } from './code-review-guide.model'
import type { CodeReviewGuide } from './code-review-guide.types'

vi.mock('./code-review-guide.api', () => ({
  codeReviewGuideApi: {
    getGuide: vi.fn(),
    generateGuide: vi.fn(),
    refreshGuide: vi.fn(),
  },
}))

describe('useCodeReviewGuideStore', () => {
  beforeEach(() => {
    useCodeReviewGuideStore.setState({
      guidesByKey: {},
      loadingGuideKeys: {},
      generatingGuideKeys: {},
      error: null,
    })
    vi.mocked(codeReviewGuideApi.getGuide).mockReset()
    vi.mocked(codeReviewGuideApi.generateGuide).mockReset()
    vi.mocked(codeReviewGuideApi.refreshGuide).mockReset()
  })

  it('loads and caches guides by cache identity', async () => {
    const input = makeLookup()
    const guide = makeGuide()
    const key = buildCodeReviewGuideKey(input)
    vi.mocked(codeReviewGuideApi.getGuide).mockResolvedValue(guide)

    await expect(
      useCodeReviewGuideStore.getState().loadGuide(input),
    ).resolves.toBe(guide)
    await expect(
      useCodeReviewGuideStore.getState().loadGuide(input),
    ).resolves.toBe(guide)

    expect(codeReviewGuideApi.getGuide).toHaveBeenCalledTimes(1)
    expect(useCodeReviewGuideStore.getState().guidesByKey[key]).toBe(guide)
    expect(useCodeReviewGuideStore.getState().loadingGuideKeys[key]).toBe(false)
  })

  it('generates and refreshes guides', async () => {
    const input = { ...makeLookup(), files: [] }
    const guide = makeGuide()
    const refreshed = { ...guide, overview: 'Refreshed' }
    vi.mocked(codeReviewGuideApi.generateGuide).mockResolvedValue(guide)
    vi.mocked(codeReviewGuideApi.refreshGuide).mockResolvedValue(refreshed)

    await expect(
      useCodeReviewGuideStore.getState().generateGuide(input),
    ).resolves.toBe(guide)
    await expect(
      useCodeReviewGuideStore.getState().refreshGuide(input),
    ).resolves.toBe(refreshed)

    expect(
      useCodeReviewGuideStore.getState().guidesByKey[
        buildCodeReviewGuideKey(input)
      ],
    ).toBe(refreshed)
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
