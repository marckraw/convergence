import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SelectedLineRange } from '@pierre/diffs'
import {
  buildCodeReviewFilePatchKey,
  buildCodeReviewFilePatchSelectionKey,
  buildCodeReviewSummaryKey,
  buildCodeReviewSummarySelectionKey,
  type CodeReviewTarget,
} from '@/entities/code-review'
import {
  buildCodeReviewGuideKey,
  type CodeReviewGuide,
} from '@/entities/code-review-guide'
import type { ReviewNote } from '@/entities/review-note'

const loadTargets = vi.fn()
const loadSummary = vi.fn()
const loadFilePatch = vi.fn()
const setSelectedTarget = vi.fn()
const setSelectedMode = vi.fn()
const setSelectedView = vi.fn()
const setSelectedFile = vi.fn()
const closeReview = vi.fn()
const loadGuide = vi.fn()
const generateGuide = vi.fn()
const refreshGuide = vi.fn()
const loadReviewNotes = vi.fn()
const createNote = vi.fn()
const updateNote = vi.fn()
const deleteNote = vi.fn()
const previewPacket = vi.fn()
const sendPacket = vi.fn()
const {
  loadWorkspaces,
  loadGlobalWorkspaces,
  loadPullRequestsByProjectId,
  materializeReviewWorkspace,
  openDialog,
} = vi.hoisted(() => ({
  loadWorkspaces: vi.fn(),
  loadGlobalWorkspaces: vi.fn(),
  loadPullRequestsByProjectId: vi.fn(),
  materializeReviewWorkspace: vi.fn(),
  openDialog: vi.fn(),
}))

const target: CodeReviewTarget = {
  id: 'session:session-1',
  projectId: 'project-1',
  projectName: 'Project',
  repositoryPath: '/repo',
  workspaceId: 'workspace-1',
  sessionId: 'session-1',
  sessionName: 'Feature session',
  branchName: 'feature',
  pullRequestId: null,
  pullRequestNumber: null,
  pullRequestLabel: null,
  pullRequestUrl: null,
  pullRequestBaseBranch: null,
  pullRequestHeadBranch: null,
  source: 'session',
  updatedAt: '2026-01-02T00:00:00.000Z',
  status: {
    workingTreeFileCount: 2,
    workingTreeStatusCounts: { M: 1, A: 1 },
    error: null,
  },
}

const cacheIdentity = {
  comparisonRef: null,
  comparisonPoint: null,
  workingTreeVersionToken: 'wt-1',
}

let codeReviewState: Record<string, unknown>
let guideState: Record<string, unknown>
let reviewNoteState: Record<string, unknown>

function buildTestGuide(
  sections: CodeReviewGuide['sections'],
  overrides: Partial<CodeReviewGuide> = {},
): CodeReviewGuide {
  return {
    id: 'guide-1',
    projectId: 'project-1',
    targetId: target.id,
    mode: 'working-tree',
    cacheIdentity,
    status: 'ready',
    overview: 'Persisted guide',
    generatedBy: 'deterministic',
    sections,
    error: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

vi.mock('@/entities/code-review', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/code-review')>()
  return {
    ...actual,
    useCodeReviewStore: (selector: (state: unknown) => unknown) =>
      selector(codeReviewState),
  }
})

vi.mock('@/entities/project', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeProject: {
        id: 'project-1',
        name: 'Project',
        repositoryPath: '/repo',
      },
    }),
}))

vi.mock('@/entities/dialog', () => ({
  useDialogStore: (selector: (state: unknown) => unknown) =>
    selector({
      open: openDialog,
    }),
}))

vi.mock('@/entities/code-review-guide', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/entities/code-review-guide')>()
  return {
    ...actual,
    useCodeReviewGuideStore: (selector: (state: unknown) => unknown) =>
      selector(guideState),
  }
})

vi.mock('@/entities/session', () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({ activeSessionId: 'session-1' }),
}))

vi.mock('@/entities/workspace', () => ({
  useWorkspaceStore: (selector: (state: unknown) => unknown) =>
    selector({
      loadWorkspaces,
      loadGlobalWorkspaces,
    }),
}))

vi.mock('@/entities/pull-request', () => ({
  pullRequestReviewApi: {
    materializeReviewWorkspace,
  },
  usePullRequestStore: (selector: (state: unknown) => unknown) =>
    selector({
      loadByProjectId: loadPullRequestsByProjectId,
    }),
}))

vi.mock('@/entities/review-note', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/review-note')>()
  return {
    ...actual,
    useReviewNoteStore: (selector: (state: unknown) => unknown) =>
      selector(reviewNoteState),
  }
})

vi.mock('@/widgets/session-view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/widgets/session-view')>()

  return {
    ...actual,
    ChangedFilesTree: ({
      files,
      selectedFile,
      onSelectFile,
    }: {
      files: Array<{ status: string; file: string }>
      selectedFile: string | null
      onSelectFile?: (file: string) => void
    }) => (
      <div data-testid="changed-files-tree" data-selected={selectedFile ?? ''}>
        {files.map((file) => (
          <button
            key={file.file}
            type="button"
            onClick={() => onSelectFile?.(file.file)}
          >
            {file.file}
          </button>
        ))}
      </div>
    ),
    PierreDiffViewer: ({
      file,
      diff,
      lineAnnotations,
      onSelectedLinesChange,
    }: {
      file: string | null
      diff: string
      lineAnnotations?: unknown[]
      onSelectedLinesChange?: (range: SelectedLineRange | null) => void
    }) => (
      <button
        type="button"
        data-testid="pierre-diff-viewer"
        data-file={file ?? ''}
        data-diff={diff}
        data-annotation-count={lineAnnotations?.length ?? 0}
        onClick={() =>
          onSelectedLinesChange?.({
            start: 1,
            side: 'additions',
            end: 1,
            endSide: 'additions',
          })
        }
      >
        Diff viewer
      </button>
    ),
  }
})

import { CodeReviewSurface } from './code-review-surface.container'

describe('CodeReviewSurface', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = function scrollIntoView() {}
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1600,
    })
    const summary = {
      base: null,
      cacheIdentity,
      files: [
        { status: 'M', file: 'src/app.ts' },
        { status: 'A', file: 'src/new.ts' },
      ],
    }
    const summaryKey = buildCodeReviewSummaryKey({
      target,
      mode: 'working-tree',
      cacheIdentity,
    })
    const summarySelectionKey = buildCodeReviewSummarySelectionKey({
      target,
      mode: 'working-tree',
    })
    const patchKey = buildCodeReviewFilePatchKey({
      target,
      mode: 'working-tree',
      filePath: 'src/app.ts',
      cacheIdentity,
    })
    const patchSelectionKey = buildCodeReviewFilePatchSelectionKey({
      target,
      mode: 'working-tree',
      filePath: 'src/app.ts',
    })
    const guideKey = buildCodeReviewGuideKey({
      target,
      mode: 'working-tree',
      cacheIdentity,
    })
    const guide = buildTestGuide([
      {
        id: 'review-surface',
        title: 'Review Surface and UI Flow',
        summary: 'Review surface files.',
        narrative: 'Inspect the user-facing review flow.',
        riskLevel: 'medium',
        riskRationale: 'Review flow changes can affect visible behavior.',
        checklist: [],
        files: [
          {
            path: 'src/app.ts',
            status: 'M',
            reason: 'Review the existing app change.',
            hunkHints: [],
          },
        ],
      },
    ])
    loadTargets.mockReset().mockResolvedValue([target])
    loadSummary.mockReset().mockResolvedValue(summary)
    loadFilePatch.mockReset().mockResolvedValue('@@ -1 +1 @@\n-old\n+new')
    setSelectedTarget.mockReset()
    setSelectedMode.mockReset()
    setSelectedView.mockReset()
    setSelectedFile.mockReset()
    closeReview.mockReset()
    loadGuide.mockReset().mockResolvedValue(guide)
    generateGuide.mockReset().mockResolvedValue(guide)
    refreshGuide.mockReset().mockResolvedValue(guide)
    loadReviewNotes.mockReset().mockResolvedValue(undefined)
    createNote.mockReset().mockResolvedValue({
      id: 'note-1',
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      filePath: 'src/app.ts',
      mode: 'working-tree',
      oldStartLine: null,
      oldEndLine: null,
      newStartLine: 1,
      newEndLine: 1,
      hunkHeader: '@@ -1 +1 @@',
      selectedDiff: '+new',
      body: 'Explain this',
      state: 'draft',
      sentAt: null,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    updateNote.mockReset()
    deleteNote.mockReset()
    previewPacket.mockReset().mockResolvedValue({
      noteCount: 1,
      text: 'Packet preview',
    })
    sendPacket.mockReset().mockResolvedValue({
      noteCount: 1,
      text: 'Packet preview',
      sentNotes: [],
    })
    loadWorkspaces.mockReset().mockResolvedValue(undefined)
    loadGlobalWorkspaces.mockReset().mockResolvedValue(undefined)
    loadPullRequestsByProjectId.mockReset().mockResolvedValue(undefined)
    materializeReviewWorkspace.mockReset().mockResolvedValue({
      workspace: {
        id: 'workspace-remote',
        projectId: 'project-1',
        branchName: 'convergence/pr-42',
        path: '/repo/.worktrees/pr-42',
        type: 'worktree',
        archivedAt: null,
        worktreeRemovedAt: null,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      pullRequest: {
        id: 'pr-cache-42',
        projectId: 'project-1',
        workspaceId: 'workspace-remote',
        provider: 'github',
        lookupStatus: 'found',
        state: 'open',
        repositoryOwner: 'acme',
        repositoryName: 'app',
        number: 42,
        title: 'Remote PR',
        url: 'https://github.com/acme/app/pull/42',
        isDraft: false,
        headBranch: 'feature/pr-42',
        baseBranch: 'main',
        mergedAt: null,
        lastCheckedAt: '2026-01-02T00:00:00.000Z',
        error: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      created: true,
      refreshed: false,
    })
    openDialog.mockReset()
    codeReviewState = {
      targets: [target],
      selectedTarget: target,
      selectedMode: 'working-tree',
      selectedView: 'diff',
      selectedFile: 'src/app.ts',
      targetsLoading: false,
      summariesByKey: { [summaryKey]: summary },
      summaryKeysBySelectionKey: { [summarySelectionKey]: summaryKey },
      filePatchesByKey: { [patchKey]: '@@ -1 +1 @@\n-old\n+new' },
      filePatchKeysBySelectionKey: { [patchSelectionKey]: patchKey },
      loadingSummaryKeys: {},
      loadingFilePatchKeys: {},
      error: null,
      loadTargets,
      loadSummary,
      loadFilePatch,
      setSelectedTarget,
      setSelectedMode,
      setSelectedView,
      setSelectedFile,
      closeReview,
    }
    guideState = {
      guidesByKey: { [guideKey]: guide },
      loadingGuideKeys: {},
      generatingGuideKeys: {},
      error: null,
      loadGuide,
      generateGuide,
      refreshGuide,
      clearError: vi.fn(),
    }
    reviewNoteState = {
      notesBySessionId: {},
      packetPreviewBySessionId: {},
      loading: false,
      error: null,
      loadBySession: loadReviewNotes,
      createNote,
      updateNote,
      deleteNote,
      previewPacket,
      sendPacket,
      clearError: vi.fn(),
    }
  })

  it('loads the target summary and lazy selected-file patch', async () => {
    render(<CodeReviewSurface />)

    await waitFor(() => {
      expect(loadTargets).toHaveBeenCalledWith({
        projectId: 'project-1',
        sessionId: 'session-1',
      })
    })
    expect(loadSummary).toHaveBeenCalledWith({
      target,
      mode: 'working-tree',
    })
    expect(loadFilePatch).toHaveBeenCalledWith({
      target,
      mode: 'working-tree',
      filePath: 'src/app.ts',
      cacheIdentity,
    })
    expect(loadReviewNotes).toHaveBeenCalledWith('session-1')
    expect(screen.getByTestId('changed-files-tree')).toHaveAttribute(
      'data-selected',
      'src/app.ts',
    )
    expect(screen.getByTestId('pierre-diff-viewer')).toHaveAttribute(
      'data-diff',
      '@@ -1 +1 @@\n-old\n+new',
    )
  })

  it('selects files and enables note preparation after a diff selection', () => {
    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByRole('button', { name: 'src/new.ts' }))
    expect(setSelectedFile).toHaveBeenCalledWith('src/new.ts')

    expect(
      screen.getByRole('button', { name: /Add line note/i }),
    ).toBeDisabled()
    fireEvent.click(screen.getByTestId('pierre-diff-viewer'))
    expect(screen.getByRole('button', { name: /Add line note/i })).toBeEnabled()
  })

  it('creates a draft review note from selected diff lines', async () => {
    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByTestId('pierre-diff-viewer'))
    fireEvent.click(screen.getByRole('button', { name: /Add line note/i }))
    fireEvent.change(screen.getByLabelText('Review note body'), {
      target: { value: 'Explain this' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          workspaceId: 'workspace-1',
          filePath: 'src/app.ts',
          mode: 'working-tree',
          newStartLine: 1,
          newEndLine: 1,
          selectedDiff: '+new',
          body: 'Explain this',
        }),
      )
    })
  })

  it('edits and deletes existing review notes', async () => {
    reviewNoteState = {
      ...reviewNoteState,
      notesBySessionId: {
        'session-1': [makeReviewNote()],
      },
    }
    updateNote.mockResolvedValueOnce(makeReviewNote({ body: 'Updated note' }))
    deleteNote.mockResolvedValueOnce(undefined)

    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByTitle('Edit review note'))
    fireEvent.change(screen.getByLabelText('Edit review note body'), {
      target: { value: 'Updated note' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith('note-1', {
        body: 'Updated note',
      })
    })

    fireEvent.click(screen.getByTitle('Delete review note'))

    expect(deleteNote).toHaveBeenCalledWith('note-1', 'session-1')
  })

  it('previews and sends draft review note packets to linked sessions', async () => {
    reviewNoteState = {
      ...reviewNoteState,
      notesBySessionId: {
        'session-1': [makeReviewNote()],
      },
    }

    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByRole('button', { name: 'Preview packet' }))

    await waitFor(() => {
      expect(previewPacket).toHaveBeenCalledWith({ sessionId: 'session-1' })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }))

    await waitFor(() => {
      expect(sendPacket).toHaveBeenCalledWith({ sessionId: 'session-1' })
    })
  })

  it('shows disabled handoff actions when no session is linked', () => {
    codeReviewState = {
      ...codeReviewState,
      selectedTarget: {
        ...target,
        id: 'project-repository:project-1',
        sessionId: null,
        sessionName: null,
        source: 'project-repository',
      },
    }

    render(<CodeReviewSurface />)

    expect(
      screen.getByRole('button', { name: 'Attach session' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Start review session' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Keep notes local' }),
    ).toBeDisabled()
  })

  it('routes mode changes through the shared code review store', () => {
    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByRole('button', { name: 'Base Branch' }))

    expect(setSelectedMode).toHaveBeenCalledWith('base-branch')
    expect(setSelectedFile).toHaveBeenLastCalledWith(null)
  })

  it('normalizes stale base-branch routes for targets without sessions', async () => {
    const remoteTarget: CodeReviewTarget = {
      ...target,
      id: 'pull-request:github:acme/app#42',
      workspaceId: null,
      sessionId: null,
      sessionName: null,
      pullRequestId: null,
      pullRequestNumber: 42,
      pullRequestLabel: '#42 Remote PR',
      pullRequestUrl: 'https://github.com/acme/app/pull/42',
      pullRequestBaseBranch: 'main',
      pullRequestHeadBranch: 'feature/pr-42',
      source: 'pull-request',
    }
    codeReviewState = {
      ...codeReviewState,
      targets: [remoteTarget],
      selectedTarget: remoteTarget,
      selectedMode: 'base-branch',
      selectedFile: null,
      summariesByKey: {},
      summaryKeysBySelectionKey: {},
      filePatchesByKey: {},
      filePatchKeysBySelectionKey: {},
    }
    const onRouteSearchChange = vi.fn()

    render(
      <CodeReviewSurface
        routeMode="base-branch"
        onRouteSearchChange={onRouteSearchChange}
      />,
    )

    await waitFor(() => {
      expect(loadSummary).toHaveBeenCalledWith({
        target: remoteTarget,
        mode: 'working-tree',
      })
    })
    expect(loadSummary).not.toHaveBeenCalledWith({
      target: remoteTarget,
      mode: 'base-branch',
    })
    expect(setSelectedMode).toHaveBeenCalledWith('working-tree')
    expect(setSelectedMode).not.toHaveBeenCalledWith('base-branch')
    expect(onRouteSearchChange).toHaveBeenCalledWith({
      mode: 'working-tree',
      file: null,
    })
  })

  it('routes presentation view changes through the shared code review store', () => {
    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByRole('button', { name: 'Guide' }))

    expect(setSelectedView).toHaveBeenCalledWith('guide')
    expect(screen.getAllByText('Opening guide...').length).toBeGreaterThan(0)
  })

  it('does not show pull request checkout for local review targets', () => {
    render(<CodeReviewSurface />)

    expect(
      screen.queryByRole('button', { name: 'Check out PR' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'New session' }),
    ).not.toBeInTheDocument()
  })

  it('checks out remote pull requests and selects the materialized target', async () => {
    const remoteTarget: CodeReviewTarget = {
      ...target,
      id: 'pull-request:github:acme/app#42',
      repositoryPath: '/repo',
      workspaceId: null,
      sessionId: null,
      sessionName: null,
      branchName: 'feature/pr-42',
      pullRequestId: null,
      pullRequestNumber: 42,
      pullRequestLabel: '#42 Remote PR',
      pullRequestUrl: 'https://github.com/acme/app/pull/42',
      pullRequestBaseBranch: 'main',
      pullRequestHeadBranch: 'feature/pr-42',
      source: 'pull-request',
    }
    const materializedTarget: CodeReviewTarget = {
      ...remoteTarget,
      id: 'pull-request:pr-cache-42',
      workspaceId: 'workspace-remote',
      pullRequestId: 'pr-cache-42',
      repositoryPath: '/repo/.worktrees/pr-42',
      branchName: 'convergence/pr-42',
    }
    loadTargets.mockResolvedValue([materializedTarget])
    codeReviewState = {
      ...codeReviewState,
      targets: [remoteTarget],
      selectedTarget: remoteTarget,
    }

    const onRouteSearchChange = vi.fn()
    render(<CodeReviewSurface onRouteSearchChange={onRouteSearchChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Check out PR' }))

    await waitFor(() => {
      expect(materializeReviewWorkspace).toHaveBeenCalledWith({
        projectId: 'project-1',
        reference: '42',
      })
    })
    expect(loadTargets).toHaveBeenCalledWith({
      projectId: 'project-1',
      sessionId: 'session-1',
    })
    expect(loadWorkspaces).toHaveBeenCalledWith('project-1')
    expect(loadGlobalWorkspaces).toHaveBeenCalled()
    expect(loadPullRequestsByProjectId).toHaveBeenCalledWith('project-1')

    await waitFor(() => {
      expect(setSelectedTarget).toHaveBeenCalledWith(materializedTarget)
    })
    expect(onRouteSearchChange).toHaveBeenCalledWith({
      targetId: materializedTarget.id,
      mode: 'working-tree',
      view: 'diff',
      file: 'src/app.ts',
    })
  })

  it('shows checkout loading state while materializing a pull request', async () => {
    const remoteTarget: CodeReviewTarget = {
      ...target,
      id: 'pull-request:github:acme/app#42',
      repositoryPath: '/repo',
      workspaceId: null,
      sessionId: null,
      sessionName: null,
      branchName: 'feature/pr-42',
      pullRequestId: null,
      pullRequestNumber: 42,
      pullRequestLabel: '#42 Remote PR',
      pullRequestUrl: 'https://github.com/acme/app/pull/42',
      pullRequestBaseBranch: 'main',
      pullRequestHeadBranch: 'feature/pr-42',
      source: 'pull-request',
    }
    const materializedTarget: CodeReviewTarget = {
      ...remoteTarget,
      id: 'pull-request:pr-cache-42',
      workspaceId: 'workspace-remote',
      pullRequestId: 'pr-cache-42',
      repositoryPath: '/repo/.worktrees/pr-42',
      branchName: 'convergence/pr-42',
    }
    let resolveCheckout: (
      value: Awaited<ReturnType<typeof materializeReviewWorkspace>>,
    ) => void
    const checkoutPromise = new Promise<
      Awaited<ReturnType<typeof materializeReviewWorkspace>>
    >((resolve) => {
      resolveCheckout = resolve
    })
    materializeReviewWorkspace.mockReturnValue(checkoutPromise)
    loadTargets.mockResolvedValue([materializedTarget])
    codeReviewState = {
      ...codeReviewState,
      targets: [remoteTarget],
      selectedTarget: remoteTarget,
    }

    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByRole('button', { name: 'Check out PR' }))

    await waitFor(() => {
      expect(screen.getAllByText('Checking out PR...').length).toBeGreaterThan(
        0,
      )
    })
    expect(screen.getByRole('button', { name: 'Check out PR' })).toBeDisabled()

    resolveCheckout!({
      workspace: {
        id: 'workspace-remote',
        projectId: 'project-1',
        branchName: 'convergence/pr-42',
        path: '/repo/.worktrees/pr-42',
        type: 'worktree',
        archivedAt: null,
        worktreeRemovedAt: null,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      pullRequest: {
        id: 'pr-cache-42',
        projectId: 'project-1',
        workspaceId: 'workspace-remote',
        provider: 'github',
        lookupStatus: 'found',
        state: 'open',
        repositoryOwner: 'acme',
        repositoryName: 'app',
        number: 42,
        title: 'Remote PR',
        url: 'https://github.com/acme/app/pull/42',
        isDraft: false,
        headBranch: 'feature/pr-42',
        baseBranch: 'main',
        mergedAt: null,
        lastCheckedAt: '2026-01-02T00:00:00.000Z',
        error: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      created: true,
      refreshed: false,
    })

    await waitFor(() => {
      expect(setSelectedTarget).toHaveBeenCalledWith(materializedTarget)
    })
  })

  it('surfaces dirty worktree checkout failures clearly', async () => {
    const remoteTarget: CodeReviewTarget = {
      ...target,
      id: 'pull-request:github:acme/app#42',
      workspaceId: null,
      sessionId: null,
      sessionName: null,
      pullRequestId: null,
      pullRequestNumber: 42,
      pullRequestLabel: '#42 Remote PR',
      pullRequestUrl: 'https://github.com/acme/app/pull/42',
      pullRequestBaseBranch: 'main',
      pullRequestHeadBranch: 'feature/pr-42',
      source: 'pull-request',
    }
    materializeReviewWorkspace.mockRejectedValue(
      new Error(
        'The existing review Workspace has local changes. Clean or archive it before refreshing this Pull Request.',
      ),
    )
    codeReviewState = {
      ...codeReviewState,
      targets: [remoteTarget],
      selectedTarget: remoteTarget,
    }

    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByRole('button', { name: 'Check out PR' }))

    expect(
      await screen.findByText(
        'The existing PR worktree has local changes. Clean or archive it before refreshing this pull request.',
      ),
    ).toBeInTheDocument()
    expect(loadWorkspaces).not.toHaveBeenCalled()
  })

  it('surfaces GitHub CLI checkout failures in the review rail', async () => {
    const remoteTarget: CodeReviewTarget = {
      ...target,
      id: 'pull-request:github:acme/app#42',
      workspaceId: null,
      sessionId: null,
      sessionName: null,
      pullRequestId: null,
      pullRequestNumber: 42,
      pullRequestLabel: '#42 Remote PR',
      pullRequestUrl: 'https://github.com/acme/app/pull/42',
      pullRequestBaseBranch: 'main',
      pullRequestHeadBranch: 'feature/pr-42',
      source: 'pull-request',
    }
    materializeReviewWorkspace.mockRejectedValue(
      new Error('GitHub CLI is not authenticated. Run gh auth login.'),
    )
    codeReviewState = {
      ...codeReviewState,
      targets: [remoteTarget],
      selectedTarget: remoteTarget,
    }

    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByRole('button', { name: 'Check out PR' }))

    expect(
      await screen.findByText(
        'GitHub CLI is not authenticated. Run gh auth login.',
      ),
    ).toBeInTheDocument()
  })

  it('falls back to the materialized workspace target when the PR target is stale', async () => {
    const remoteTarget: CodeReviewTarget = {
      ...target,
      id: 'pull-request:github:acme/app#42',
      repositoryPath: '/repo',
      workspaceId: null,
      sessionId: null,
      sessionName: null,
      branchName: 'feature/pr-42',
      pullRequestId: null,
      pullRequestNumber: 42,
      pullRequestLabel: '#42 Remote PR',
      pullRequestUrl: 'https://github.com/acme/app/pull/42',
      pullRequestBaseBranch: 'main',
      pullRequestHeadBranch: 'feature/pr-42',
      source: 'pull-request',
    }
    const workspaceTarget: CodeReviewTarget = {
      ...remoteTarget,
      id: 'workspace:workspace-remote',
      source: 'workspace',
      workspaceId: 'workspace-remote',
      pullRequestId: null,
      repositoryPath: '/repo/.worktrees/pr-42',
      branchName: 'convergence/pr-42',
    }
    loadTargets.mockResolvedValue([workspaceTarget])
    codeReviewState = {
      ...codeReviewState,
      targets: [remoteTarget],
      selectedTarget: remoteTarget,
    }

    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByRole('button', { name: 'Check out PR' }))

    await waitFor(() => {
      expect(setSelectedTarget).toHaveBeenCalledWith(workspaceTarget)
    })
    expect(
      await screen.findByText(
        'Checked out the PR worktree, but the PR review target was not available yet. Showing the workspace target instead.',
      ),
    ).toBeInTheDocument()
  })

  it('opens the session intent dialog for workspace-backed pull requests', () => {
    codeReviewState = {
      ...codeReviewState,
      selectedTarget: {
        ...target,
        id: 'pull-request:pr-cache-42',
        source: 'pull-request',
        pullRequestId: 'pr-cache-42',
        pullRequestNumber: 42,
        pullRequestLabel: '#42 Remote PR',
        pullRequestUrl: 'https://github.com/acme/app/pull/42',
        pullRequestBaseBranch: 'main',
        pullRequestHeadBranch: 'feature/pr-42',
        workspaceId: 'workspace-remote',
        sessionId: null,
        sessionName: null,
      },
    }

    render(<CodeReviewSurface />)

    expect(
      screen.queryByRole('button', { name: 'Check out PR' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New session' }))

    expect(openDialog).toHaveBeenCalledWith('session-intent', {
      workspaceId: 'workspace-remote',
    })
  })

  it('keeps remote-only pull requests on checkout before session actions', () => {
    codeReviewState = {
      ...codeReviewState,
      selectedTarget: {
        ...target,
        id: 'pull-request:github:acme/app#42',
        source: 'pull-request',
        workspaceId: null,
        sessionId: null,
        sessionName: null,
        pullRequestId: null,
        pullRequestNumber: 42,
        pullRequestLabel: '#42 Remote PR',
        pullRequestUrl: 'https://github.com/acme/app/pull/42',
        pullRequestBaseBranch: 'main',
        pullRequestHeadBranch: 'feature/pr-42',
      },
    }

    render(<CodeReviewSurface />)

    expect(screen.getByRole('button', { name: 'Check out PR' })).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'New session' }),
    ).not.toBeInTheDocument()
  })

  it('emits route search changes for target, mode, and file selections', () => {
    const onRouteSearchChange = vi.fn()
    render(<CodeReviewSurface onRouteSearchChange={onRouteSearchChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Base Branch' }))
    expect(onRouteSearchChange).toHaveBeenCalledWith({
      mode: 'base-branch',
      file: null,
    })

    fireEvent.click(screen.getByRole('button', { name: 'src/new.ts' }))
    expect(onRouteSearchChange).toHaveBeenCalledWith({ file: 'src/new.ts' })
  })

  it('renders deterministic guide sections backed by real file patches', async () => {
    codeReviewState = {
      ...codeReviewState,
      selectedView: 'guide',
    }

    render(<CodeReviewSurface routeView="guide" />)

    expect(
      screen.getAllByText('Review Surface and UI Flow').length,
    ).toBeGreaterThan(0)
    await waitFor(() => {
      expect(loadFilePatch).toHaveBeenCalledWith({
        target,
        mode: 'working-tree',
        filePath: 'src/app.ts',
        cacheIdentity,
      })
    })
    expect(screen.getAllByTestId('pierre-diff-viewer')[0]).toHaveAttribute(
      'data-file',
      'src/app.ts',
    )
  })

  it('scrolls guide file links within their section and updates selected file state', () => {
    const guideKey = buildCodeReviewGuideKey({
      target,
      mode: 'working-tree',
      cacheIdentity,
    })
    const duplicatePathGuide = buildTestGuide([
      {
        id: 'first-pass',
        title: 'First Pass',
        summary: 'First pass summary.',
        narrative: 'Review the first pass.',
        riskLevel: 'medium',
        riskRationale: 'Visible flow changes.',
        checklist: [],
        files: [
          {
            path: 'src/app.ts',
            status: 'M',
            reason: 'First section reason.',
            hunkHints: [],
          },
        ],
      },
      {
        id: 'follow-up',
        title: 'Follow-up',
        summary: 'Follow-up summary.',
        narrative: 'Review the follow-up.',
        riskLevel: 'low',
        riskRationale: 'Small follow-up.',
        checklist: [],
        files: [
          {
            path: 'src/app.ts',
            status: 'M',
            reason: 'Second section reason.',
            hunkHints: [],
          },
        ],
      },
    ])
    const scrolledTargets: Element[] = []
    Element.prototype.scrollIntoView = function scrollIntoView() {
      scrolledTargets.push(this)
    }
    codeReviewState = {
      ...codeReviewState,
      selectedView: 'guide',
    }
    guideState = {
      ...guideState,
      guidesByKey: { [guideKey]: duplicatePathGuide },
    }
    const onRouteSearchChange = vi.fn()

    render(
      <CodeReviewSurface
        routeView="guide"
        onRouteSearchChange={onRouteSearchChange}
      />,
    )

    fireEvent.click(screen.getAllByTitle('src/app.ts')[1])

    expect(setSelectedFile).toHaveBeenCalledWith('src/app.ts')
    expect(onRouteSearchChange).toHaveBeenCalledWith({ file: 'src/app.ts' })
    expect(scrolledTargets[0]).toHaveAttribute(
      'data-guide-section-id',
      'follow-up',
    )
  })

  it('shows failed guide generation state with a retry action', () => {
    codeReviewState = {
      ...codeReviewState,
      selectedView: 'guide',
    }
    guideState = {
      ...guideState,
      error: 'Guide generation timed out',
    }

    render(<CodeReviewSurface routeView="guide" />)

    expect(screen.getByText('Guide failed')).toBeInTheDocument()
    expect(screen.getAllByText('Guide generation timed out').length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))

    expect(generateGuide).toHaveBeenCalledWith({
      target,
      mode: 'working-tree',
      cacheIdentity,
      files: [
        { status: 'M', file: 'src/app.ts' },
        { status: 'A', file: 'src/new.ts' },
      ],
    })
  })

  it('waits for an explicit action before generating an AI guide', async () => {
    codeReviewState = {
      ...codeReviewState,
      selectedView: 'guide',
    }
    guideState = {
      ...guideState,
      guidesByKey: {},
    }
    loadGuide.mockResolvedValue(null)

    render(<CodeReviewSurface routeView="guide" />)

    await waitFor(() => {
      expect(loadGuide).toHaveBeenCalled()
    })
    expect(generateGuide).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Generate/ }))

    expect(generateGuide).toHaveBeenCalledWith({
      target,
      mode: 'working-tree',
      cacheIdentity,
      files: [
        { status: 'M', file: 'src/app.ts' },
        { status: 'A', file: 'src/new.ts' },
      ],
    })
  })

  it('force refreshes the active summary and selected-file patch', () => {
    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh review data' }))

    expect(loadSummary).toHaveBeenCalledWith(
      { target, mode: 'working-tree' },
      { force: true },
    )
    expect(loadFilePatch).toHaveBeenCalledWith(
      {
        target,
        mode: 'working-tree',
        filePath: 'src/app.ts',
        cacheIdentity,
      },
      { force: true },
    )
  })

  it('keeps the previous selected-file diff visible while a replacement patch loads', () => {
    const nextCacheIdentity = {
      ...cacheIdentity,
      workingTreeVersionToken: 'wt-2',
    }
    const nextSummary = {
      base: null,
      cacheIdentity: nextCacheIdentity,
      files: [
        { status: 'M', file: 'src/app.ts' },
        { status: 'A', file: 'src/new.ts' },
      ],
    }
    const summaryKey = buildCodeReviewSummaryKey({
      target,
      mode: 'working-tree',
      cacheIdentity: nextCacheIdentity,
    })
    const summarySelectionKey = buildCodeReviewSummarySelectionKey({
      target,
      mode: 'working-tree',
    })
    const oldPatchKey = buildCodeReviewFilePatchKey({
      target,
      mode: 'working-tree',
      filePath: 'src/app.ts',
      cacheIdentity,
    })
    const nextPatchKey = buildCodeReviewFilePatchKey({
      target,
      mode: 'working-tree',
      filePath: 'src/app.ts',
      cacheIdentity: nextCacheIdentity,
    })
    const patchSelectionKey = buildCodeReviewFilePatchSelectionKey({
      target,
      mode: 'working-tree',
      filePath: 'src/app.ts',
    })
    codeReviewState = {
      ...codeReviewState,
      summariesByKey: { [summaryKey]: nextSummary },
      summaryKeysBySelectionKey: { [summarySelectionKey]: summaryKey },
      filePatchesByKey: {
        [oldPatchKey]: '@@ -1 +1 @@\n-old\n+previous',
      },
      filePatchKeysBySelectionKey: { [patchSelectionKey]: oldPatchKey },
      loadingFilePatchKeys: { [nextPatchKey]: true },
    }

    render(<CodeReviewSurface />)

    expect(screen.getByTestId('pierre-diff-viewer')).toHaveAttribute(
      'data-diff',
      '@@ -1 +1 @@\n-old\n+previous',
    )
  })

  it('collapses and expands secondary review rails', () => {
    render(<CodeReviewSurface />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse review targets' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse review notes' }),
    )

    expect(
      screen.getByRole('button', { name: 'Expand review targets' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expand review notes' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Review Targets')).toBeNull()
    expect(screen.queryByText('Review Notes')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand review targets' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expand review notes' }))

    expect(screen.getByText('Review Targets')).toBeInTheDocument()
    expect(screen.getByText('Review Notes')).toBeInTheDocument()
  })

  it('focuses the diff by collapsing and restoring secondary rails', () => {
    render(<CodeReviewSurface />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Focus review content' }),
    )

    expect(
      screen.getByRole('button', { name: 'Exit focused review layout' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expand review targets' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expand review notes' }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Exit focused review layout' }),
    )

    expect(
      screen.getByRole('button', { name: 'Focus review content' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Collapse review targets' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Collapse review notes' }),
    ).toBeInTheDocument()
  })

  it('defaults secondary rails collapsed on small screens', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1200,
    })

    render(<CodeReviewSurface />)

    expect(
      screen.getByRole('button', { name: 'Expand review targets' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expand review notes' }),
    ).toBeInTheDocument()
  })

  it('clears file selection when the status filter changes', () => {
    codeReviewState = {
      ...codeReviewState,
      selectedFile: 'src/new.ts',
    }

    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByRole('button', { name: 'M 1' }))

    expect(setSelectedFile).toHaveBeenCalledWith(null)
    expect(screen.getByTestId('pierre-diff-viewer')).toHaveAttribute(
      'data-file',
      '',
    )
  })

  it('does not reapply a stale route file after filters clear selection', async () => {
    const onRouteSearchChange = vi.fn()
    codeReviewState = {
      ...codeReviewState,
      selectedFile: 'src/app.ts',
    }

    render(
      <CodeReviewSurface
        routeFilePath="src/app.ts"
        onRouteSearchChange={onRouteSearchChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'A 1' }))

    expect(setSelectedFile).toHaveBeenCalledWith(null)
    expect(onRouteSearchChange).toHaveBeenCalledWith({ file: null })
  })
})

function makeReviewNote(patch: Partial<ReviewNote> = {}): ReviewNote {
  return {
    id: 'note-1',
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    filePath: 'src/app.ts',
    mode: 'working-tree',
    oldStartLine: null,
    oldEndLine: null,
    newStartLine: 1,
    newEndLine: 1,
    hunkHeader: '@@ -1 +1 @@',
    selectedDiff: '+new',
    body: 'Explain this',
    state: 'draft',
    sentAt: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...patch,
  }
}
