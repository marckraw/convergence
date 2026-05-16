import { beforeEach, describe, expect, it, vi } from 'vitest'
import { codeReviewApi } from './code-review.api'
import { buildCodeReviewSummaryKey } from './code-review.pure'
import { useCodeReviewStore } from './code-review.model'

vi.mock('./code-review.api', () => ({
  codeReviewApi: {
    listTargets: vi.fn(),
    getSummary: vi.fn(),
    getFilePatch: vi.fn(),
  },
}))

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

describe('useCodeReviewStore', () => {
  beforeEach(() => {
    useCodeReviewStore.setState({
      isReviewOpen: false,
      targets: [],
      selectedTarget: null,
      selectedMode: 'working-tree',
      selectedFile: null,
      targetsLoading: false,
      summariesByKey: {},
      filePatchesByKey: {},
      loadingSummaryKeys: {},
      loadingFilePatchKeys: {},
      error: null,
    })
    vi.mocked(codeReviewApi.listTargets).mockReset()
    vi.mocked(codeReviewApi.getSummary).mockReset()
    vi.mocked(codeReviewApi.getFilePatch).mockReset()
  })

  it('opens review with optional preselected target, mode, and file', () => {
    useCodeReviewStore.getState().openReview({
      target,
      mode: 'base-branch',
      selectedFile: 'src/app.ts',
    })

    expect(useCodeReviewStore.getState()).toMatchObject({
      isReviewOpen: true,
      selectedTarget: target,
      selectedMode: 'base-branch',
      selectedFile: 'src/app.ts',
    })
  })

  it('stores selected target, mode, and file', () => {
    useCodeReviewStore.getState().setSelectedTarget(target)
    useCodeReviewStore.getState().setSelectedMode('base-branch')
    useCodeReviewStore.getState().setSelectedFile('src/app.ts')

    expect(useCodeReviewStore.getState()).toMatchObject({
      selectedTarget: target,
      selectedMode: 'base-branch',
      selectedFile: 'src/app.ts',
    })
  })

  it('loads and caches summaries by target and mode', async () => {
    vi.mocked(codeReviewApi.getSummary).mockResolvedValue({
      base: null,
      files: [{ status: 'M', file: 'src/app.ts' }],
    })

    const input = { target, mode: 'working-tree' as const }
    const result = await useCodeReviewStore.getState().loadSummary(input)
    const key = buildCodeReviewSummaryKey(input)

    expect(result?.files).toEqual([{ status: 'M', file: 'src/app.ts' }])
    expect(useCodeReviewStore.getState().summariesByKey[key]).toEqual(result)
    expect(useCodeReviewStore.getState().loadingSummaryKeys[key]).toBe(false)
    expect(useCodeReviewStore.getState().error).toBeNull()

    await expect(
      useCodeReviewStore.getState().loadSummary(input),
    ).resolves.toBe(result)
    expect(codeReviewApi.getSummary).toHaveBeenCalledTimes(1)
  })

  it('force reloads cached summaries for explicit refresh', async () => {
    vi.mocked(codeReviewApi.getSummary)
      .mockResolvedValueOnce({
        base: null,
        files: [{ status: 'M', file: 'src/app.ts' }],
      })
      .mockResolvedValueOnce({
        base: null,
        files: [{ status: 'A', file: 'src/new.ts' }],
      })

    const input = { target, mode: 'working-tree' as const }
    await useCodeReviewStore.getState().loadSummary(input)
    const result = await useCodeReviewStore
      .getState()
      .loadSummary(input, { force: true })

    expect(result?.files).toEqual([{ status: 'A', file: 'src/new.ts' }])
    expect(codeReviewApi.getSummary).toHaveBeenCalledTimes(2)
  })

  it('loads targets and refreshes the selected target from the response', async () => {
    const refreshed = {
      ...target,
      status: {
        workingTreeFileCount: 2,
        workingTreeStatusCounts: { M: 2 },
        error: null,
      },
    }
    vi.mocked(codeReviewApi.listTargets).mockResolvedValue([refreshed])
    useCodeReviewStore.getState().setSelectedTarget(target)

    await expect(
      useCodeReviewStore.getState().loadTargets({ projectId: 'project-1' }),
    ).resolves.toEqual([refreshed])

    expect(useCodeReviewStore.getState().targets).toEqual([refreshed])
    expect(useCodeReviewStore.getState().selectedTarget).toEqual(refreshed)
    expect(useCodeReviewStore.getState().targetsLoading).toBe(false)
  })

  it('captures API errors and returns null', async () => {
    vi.mocked(codeReviewApi.getSummary).mockRejectedValue(new Error('no repo'))

    await expect(
      useCodeReviewStore
        .getState()
        .loadSummary({ target, mode: 'working-tree' }),
    ).resolves.toBeNull()

    expect(useCodeReviewStore.getState().error).toBe('no repo')
  })

  it('loads and caches file patches by target mode and file', async () => {
    vi.mocked(codeReviewApi.getFilePatch).mockResolvedValue('diff body')

    const input = {
      target,
      mode: 'base-branch',
      filePath: 'src/app.ts',
    } as const
    const result = await useCodeReviewStore.getState().loadFilePatch(input)

    expect(result).toBe('diff body')
    expect(
      Object.values(useCodeReviewStore.getState().filePatchesByKey),
    ).toEqual(['diff body'])

    await expect(
      useCodeReviewStore.getState().loadFilePatch(input),
    ).resolves.toBe('diff body')
    expect(codeReviewApi.getFilePatch).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent file patch loads for the same key', async () => {
    const deferred = createDeferred<string>()
    vi.mocked(codeReviewApi.getFilePatch).mockReturnValue(deferred.promise)

    const input = {
      target,
      mode: 'working-tree',
      filePath: 'src/app.ts',
    } as const
    const first = useCodeReviewStore.getState().loadFilePatch(input)
    const second = useCodeReviewStore.getState().loadFilePatch(input)

    deferred.resolve('diff body')

    await expect(first).resolves.toBe('diff body')
    await expect(second).resolves.toBe('diff body')
    expect(codeReviewApi.getFilePatch).toHaveBeenCalledTimes(1)
  })

  it('prevents stale forced file patch responses from overwriting newer cache', async () => {
    const first = createDeferred<string>()
    const second = createDeferred<string>()
    vi.mocked(codeReviewApi.getFilePatch)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    const input = {
      target,
      mode: 'working-tree',
      filePath: 'src/app.ts',
    } as const
    const firstLoad = useCodeReviewStore
      .getState()
      .loadFilePatch(input, { force: true })
    const secondLoad = useCodeReviewStore
      .getState()
      .loadFilePatch(input, { force: true })

    second.resolve('new diff')
    await expect(secondLoad).resolves.toBe('new diff')
    first.resolve('old diff')
    await expect(firstLoad).resolves.toBe('old diff')

    expect(
      Object.values(useCodeReviewStore.getState().filePatchesByKey),
    ).toEqual(['new diff'])
  })
})

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}
