import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gitApi } from './workspace.api'
import type { BaseBranchDiffSummary } from './workspace.types'

describe('gitApi', () => {
  let getBaseBranchStatus: ReturnType<typeof vi.fn>
  let getBaseBranchDiff: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getBaseBranchStatus = vi.fn().mockResolvedValue({ files: [] })
    getBaseBranchDiff = vi.fn().mockResolvedValue('')

    Object.defineProperty(window, 'electronAPI', {
      value: {
        git: {
          getBranches: vi.fn(),
          getAllBranches: vi.fn(),
          getCurrentBranch: vi.fn(),
          getBranchOutputFacts: vi.fn(),
          getStatus: vi.fn(),
          getDiff: vi.fn(),
          getBaseBranchStatus,
          getBaseBranchDiff,
        },
      },
      configurable: true,
    })
  })

  it('forwards getBaseBranchStatus to the preload bridge', async () => {
    const summary: BaseBranchDiffSummary = {
      base: {
        branchName: 'beta',
        comparisonRef: 'origin/beta',
        source: 'project-settings',
        warning: null,
      },
      files: [{ status: 'M', file: 'src/app.ts' }],
    }
    getBaseBranchStatus.mockResolvedValue(summary)

    const result = await gitApi.getBaseBranchStatus('session-1')

    expect(getBaseBranchStatus).toHaveBeenCalledWith('session-1')
    expect(result).toEqual(summary)
  })

  it('forwards getBaseBranchDiff to the preload bridge', async () => {
    getBaseBranchDiff.mockResolvedValue('diff body')

    const result = await gitApi.getBaseBranchDiff('session-1', 'src/app.ts')

    expect(getBaseBranchDiff).toHaveBeenCalledWith('session-1', 'src/app.ts')
    expect(result).toBe('diff body')
  })
})
