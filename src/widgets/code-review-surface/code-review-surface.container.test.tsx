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
import type { ReviewNote } from '@/entities/review-note'

const loadTargets = vi.fn()
const loadSummary = vi.fn()
const loadFilePatch = vi.fn()
const setSelectedTarget = vi.fn()
const setSelectedMode = vi.fn()
const setSelectedFile = vi.fn()
const closeReview = vi.fn()
const loadReviewNotes = vi.fn()
const createNote = vi.fn()
const updateNote = vi.fn()
const deleteNote = vi.fn()
const previewPacket = vi.fn()
const sendPacket = vi.fn()

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
  pullRequestLabel: null,
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
let reviewNoteState: Record<string, unknown>

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

vi.mock('@/entities/session', () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({ activeSessionId: 'session-1' }),
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
    loadTargets.mockReset().mockResolvedValue([target])
    loadSummary.mockReset().mockResolvedValue(summary)
    loadFilePatch.mockReset().mockResolvedValue('@@ -1 +1 @@\n-old\n+new')
    setSelectedTarget.mockReset()
    setSelectedMode.mockReset()
    setSelectedFile.mockReset()
    closeReview.mockReset()
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
    codeReviewState = {
      targets: [target],
      selectedTarget: target,
      selectedMode: 'working-tree',
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
      setSelectedFile,
      closeReview,
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

  it('force refreshes the active summary and selected-file patch', () => {
    render(<CodeReviewSurface />)

    fireEvent.click(screen.getByTitle('Refresh review'))

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

    fireEvent.click(screen.getByRole('button', { name: 'Focus diff' }))

    expect(
      screen.getByRole('button', { name: 'Exit diff focus' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expand review targets' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expand review notes' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Exit diff focus' }))

    expect(
      screen.getByRole('button', { name: 'Focus diff' }),
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
