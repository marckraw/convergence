import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useReviewNoteStore, type ReviewNote } from '@/entities/review-note'
import { ChangedFilesPanel } from './changed-files-panel.container'

vi.mock('./changed-files-tree.container', () => {
  interface MockChangedFile {
    status: string
    file: string
  }

  interface MockChangedFilesTreeProps {
    files: MockChangedFile[]
    selectedFile: string | null
    loading?: boolean
    emptyMessage?: string
    noteCountsByPath?: ReadonlyMap<string, number> | Record<string, number>
    onSelectFile?: (file: string) => void
  }

  function getNoteCount(
    noteCountsByPath:
      | ReadonlyMap<string, number>
      | Record<string, number>
      | undefined,
    path: string,
  ): number {
    if (!noteCountsByPath) return 0
    const maybeMap = noteCountsByPath as ReadonlyMap<string, number>
    if (typeof maybeMap.get === 'function') return maybeMap.get(path) ?? 0
    return (noteCountsByPath as Record<string, number>)[path] ?? 0
  }

  function splitPath(file: string): { name: string; directory: string | null } {
    const segments = file.split('/')
    return {
      name: segments[segments.length - 1] ?? file,
      directory:
        segments.length > 1
          ? segments.slice(0, segments.length - 1).join('/')
          : null,
    }
  }

  return {
    ChangedFilesTree: ({
      files,
      selectedFile,
      loading = false,
      emptyMessage = 'No changed files detected',
      noteCountsByPath,
      onSelectFile,
    }: MockChangedFilesTreeProps) => {
      if (loading) return <div>Loading changed files...</div>
      if (files.length === 0) return <div>{emptyMessage}</div>

      return (
        <div aria-label="Changed files tree">
          {files.map((file) => {
            const { name, directory } = splitPath(file.file)
            const noteCount = getNoteCount(noteCountsByPath, file.file)

            return (
              <button
                key={file.file}
                type="button"
                aria-pressed={selectedFile === file.file}
                title={file.file}
                onClick={() => onSelectFile?.(file.file)}
              >
                <span>{name}</span>
                {directory && <span>{directory}</span>}
                {noteCount > 0 && (
                  <span
                    title={`${noteCount} review ${
                      noteCount === 1 ? 'note' : 'notes'
                    }`}
                  >
                    {noteCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )
    },
  }
})

vi.mock('./pierre-diff-viewer.container', () => ({
  PierreDiffViewer: ({
    file,
    diff,
    loading = false,
    emptyMessage,
    title,
    onSelectedLinesChange,
    lineAnnotations = [],
    renderAnnotation,
  }: {
    file: string | null
    diff: string
    loading?: boolean
    emptyMessage?: string
    title?: string
    lineAnnotations?: Array<{
      side: 'deletions' | 'additions'
      lineNumber: number
      metadata: {
        note: ReviewNote
      }
    }>
    renderAnnotation?: (annotation: {
      side: 'deletions' | 'additions'
      lineNumber: number
      metadata: {
        note: ReviewNote
      }
    }) => ReactNode
    onSelectedLinesChange?: (range: {
      start: number
      side: 'deletions' | 'additions'
      end: number
      endSide: 'deletions' | 'additions'
    }) => void
  }) => {
    if (!file) return <div>{emptyMessage}</div>
    if (loading) return <div>Loading diff...</div>

    return (
      <div>
        <p>{file.split('/').at(-1)}</p>
        <p>{title}</p>
        {diff.split('\n').map((line, index) => {
          if (line.startsWith('-')) {
            return (
              <button
                key={`${index}:${line}`}
                type="button"
                onClick={() =>
                  onSelectedLinesChange?.({
                    start: 1,
                    side: 'deletions',
                    end: 1,
                    endSide: 'deletions',
                  })
                }
              >
                {line}
              </button>
            )
          }

          if (line.startsWith('+')) {
            return (
              <button
                key={`${index}:${line}`}
                type="button"
                onClick={(event) =>
                  onSelectedLinesChange?.(
                    event.shiftKey
                      ? {
                          start: 1,
                          side: 'deletions',
                          end: 1,
                          endSide: 'additions',
                        }
                      : {
                          start: 1,
                          side: 'additions',
                          end: 1,
                          endSide: 'additions',
                        },
                  )
                }
              >
                {line}
              </button>
            )
          }

          return <span key={`${index}:${line}`}>{line}</span>
        })}
        {lineAnnotations.map((annotation) => (
          <div
            key={annotation.metadata.note.id}
            data-testid={`diff-annotation-${annotation.metadata.note.id}`}
          >
            {renderAnnotation?.(annotation)}
          </div>
        ))}
      </div>
    )
  },
}))

const session = {
  id: 'session-1',
  contextKind: 'project' as const,
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium' as const,
  name: 'Test session',
  status: 'running' as const,
  attention: 'none' as const,
  activity: null,
  contextWindow: null,
  workingDirectory: '/tmp/project',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation' as const,
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('ChangedFilesPanel', () => {
  beforeEach(() => {
    useReviewNoteStore.setState({
      notesBySessionId: {},
      packetPreviewBySessionId: {},
      loading: false,
      error: null,
    })

    Object.defineProperty(window, 'electronAPI', {
      value: {
        git: {
          getStatus: vi.fn().mockResolvedValue([
            { status: 'M', file: 'src/app.ts' },
            { status: '??', file: 'src/new-file.ts' },
          ]),
          getDiff: vi
            .fn()
            .mockResolvedValue(
              '@@ -1 +1 @@\n-console.log("old")\n+console.log("new")',
            ),
          getBaseBranchStatus: vi.fn().mockResolvedValue({
            base: {
              branchName: 'beta',
              comparisonRef: 'origin/beta',
              source: 'project-settings',
              warning: null,
            },
            files: [{ status: 'M', file: 'src/base.ts' }],
          }),
          getBaseBranchDiff: vi
            .fn()
            .mockResolvedValue('@@ -1 +1 @@\n-old-base\n+new-base'),
        },
        turns: {
          listForSession: vi.fn().mockResolvedValue([]),
          getFileChanges: vi.fn().mockResolvedValue([]),
          getFileDiff: vi.fn().mockResolvedValue(''),
          onTurnDelta: vi.fn().mockReturnValue(() => {}),
        },
        reviewNotes: {
          listBySession: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation((input: Record<string, unknown>) =>
            Promise.resolve({
              id: 'note-1',
              ...input,
              state: 'draft',
              sentAt: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            }),
          ),
          update: vi
            .fn()
            .mockImplementation((id: string, patch: Record<string, unknown>) =>
              Promise.resolve({
                id,
                sessionId: session.id,
                workspaceId: session.workspaceId,
                filePath: 'src/app.ts',
                mode: 'working-tree',
                oldStartLine: 1,
                oldEndLine: null,
                newStartLine: 1,
                newEndLine: null,
                hunkHeader: '@@ -1 +1 @@',
                selectedDiff: '-console.log("old")\n+console.log("new")',
                body: patch.body ?? 'Updated note',
                state: patch.state ?? 'draft',
                sentAt: null,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:01.000Z',
              }),
            ),
          delete: vi.fn().mockResolvedValue(undefined),
          previewPacket: vi.fn().mockResolvedValue({
            noteCount: 1,
            text: 'Please help me understand these local code review notes.',
          }),
          sendPacket: vi
            .fn()
            .mockImplementation((input: { sessionId: string }) =>
              Promise.resolve({
                noteCount: 1,
                text: 'Please help me understand these local code review notes.',
                sentNotes: [
                  makeReviewNote({
                    id: 'note-app',
                    sessionId: input.sessionId,
                    state: 'sent',
                    sentAt: '2026-01-01T00:00:01.000Z',
                  }),
                ],
              }),
            ),
        },
      },
      configurable: true,
      writable: true,
    })
  })

  it('shows working tree files and the selected file diff', async () => {
    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Changed Files (2)')).toBeInTheDocument()
    })

    expect(
      screen.getByText('Current git changes in this session workspace.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Files')).toBeInTheDocument()
    expect(screen.getByText('2 changed')).toBeInTheDocument()
    expect(screen.getByLabelText('Changed files tree')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Current workspace diff')).toBeInTheDocument()
      expect(screen.getAllByText('app.ts').length).toBeGreaterThan(0)
      expect(screen.getAllByText('src').length).toBeGreaterThan(0)
      expect(screen.getByText('+console.log("new")')).toBeInTheDocument()
    })
  })

  it('creates a draft review note from a selected diff line range', async () => {
    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('-console.log("old")')).toBeInTheDocument()
      expect(screen.getByText('+console.log("new")')).toBeInTheDocument()
    })

    const deletedLine = screen
      .getByText('-console.log("old")')
      .closest('button')
    const addedLine = screen.getByText('+console.log("new")').closest('button')
    expect(deletedLine).not.toBeNull()
    expect(addedLine).not.toBeNull()

    fireEvent.click(deletedLine!)
    fireEvent.click(addedLine!, { shiftKey: true })

    expect(screen.getByText('2 lines selected')).toBeInTheDocument()
    expect(screen.getByText('Old 1 · New 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /add note/i }))
    fireEvent.change(screen.getByLabelText('Review note body'), {
      target: { value: 'Why did this change?' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))

    await waitFor(() => {
      expect(
        screen.getAllByText('Why did this change?').length,
      ).toBeGreaterThan(0)
    })

    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const reviewNotes = electronAPI.reviewNotes as Record<
      string,
      ReturnType<typeof vi.fn>
    >
    expect(reviewNotes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        workspaceId: session.workspaceId,
        filePath: 'src/app.ts',
        mode: 'working-tree',
        oldStartLine: 1,
        newStartLine: 1,
        selectedDiff: '-console.log("old")\n+console.log("new")',
        body: 'Why did this change?',
      }),
    )
  })

  it('creates a file-level draft review note without selected diff lines', async () => {
    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('+console.log("new")')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /file note/i }))
    fireEvent.change(screen.getByLabelText('File-level review note body'), {
      target: { value: 'Why did this whole file change?' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save note/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Why did this whole file change?'),
      ).toBeInTheDocument()
    })

    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const reviewNotes = electronAPI.reviewNotes as Record<
      string,
      ReturnType<typeof vi.fn>
    >
    expect(reviewNotes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        workspaceId: session.workspaceId,
        filePath: 'src/app.ts',
        mode: 'working-tree',
        oldStartLine: null,
        oldEndLine: null,
        newStartLine: null,
        newEndLine: null,
        hunkHeader: null,
        body: 'Why did this whole file change?',
      }),
    )
    expect(reviewNotes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedDiff:
          '(file-level note for src/app.ts; no specific diff lines selected)',
      }),
    )
  })

  it('shows grouped review notes, file badges, and jumps back to note ranges', async () => {
    const notes = [
      makeReviewNote({
        id: 'note-app',
        filePath: 'src/app.ts',
        body: 'Question on app',
        newStartLine: 1,
      }),
      makeReviewNote({
        id: 'note-new',
        filePath: 'src/new-file.ts',
        body: 'Question on new file',
        newStartLine: 1,
      }),
      makeReviewNote({
        id: 'note-new-second',
        filePath: 'src/new-file.ts',
        body: 'Second question on new file',
        oldStartLine: 1,
        newStartLine: null,
      }),
    ]
    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const reviewNotes = electronAPI.reviewNotes as Record<
      string,
      ReturnType<typeof vi.fn>
    >
    reviewNotes.listBySession.mockResolvedValue(notes)

    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Question on new file')).toBeInTheDocument()
    })

    expect(screen.getByText('3 draft notes')).toBeInTheDocument()
    expect(screen.getAllByText('Question on app').length).toBeGreaterThan(0)
    expect(screen.getByText('Second question on new file')).toBeInTheDocument()
    expect(screen.getByTitle('2 review notes')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Question on new file'))

    await waitFor(() => {
      expect(screen.getByText('1 line selected')).toBeInTheDocument()
      expect(screen.getByText('New 1')).toBeInTheDocument()
    })

    const git = electronAPI.git as Record<string, ReturnType<typeof vi.fn>>
    expect(git.getDiff).toHaveBeenCalledWith(
      session.workingDirectory,
      'src/new-file.ts',
    )
  })

  it('does not mark a note anchor stale while its target diff is still loading', async () => {
    const note = makeReviewNote({
      id: 'note-new',
      filePath: 'src/new-file.ts',
      body: 'Question on new file',
      newStartLine: 1,
    })
    const targetDiff = createDeferred<string>()
    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const git = electronAPI.git as Record<string, ReturnType<typeof vi.fn>>
    const reviewNotes = electronAPI.reviewNotes as Record<
      string,
      ReturnType<typeof vi.fn>
    >
    reviewNotes.listBySession.mockResolvedValue([note])
    git.getDiff.mockImplementation(
      (_workingDirectory: string, filePath?: string) => {
        if (filePath === 'src/new-file.ts') return targetDiff.promise
        return Promise.resolve('@@ -1 +1 @@\n-old app\n+new app')
      },
    )

    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Question on new file')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Question on new file'))

    await waitFor(() => {
      expect(screen.getByText('Loading diff...')).toBeInTheDocument()
    })
    expect(screen.queryByText('stale anchor')).not.toBeInTheDocument()

    targetDiff.resolve('@@ -1 +1 @@\n-old new file\n+new file answer')

    await waitFor(() => {
      expect(screen.getByText('1 line selected')).toBeInTheDocument()
      expect(screen.getByText('New 1')).toBeInTheDocument()
    })
  })

  it('ignores stale diff responses after quickly selecting another file', async () => {
    const newFileDiff = createDeferred<string>()
    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const git = electronAPI.git as Record<string, ReturnType<typeof vi.fn>>
    git.getDiff.mockImplementation(
      (_workingDirectory: string, filePath?: string) => {
        if (filePath === 'src/new-file.ts') return newFileDiff.promise
        return Promise.resolve('@@ -1 +1 @@\n-old app\n+current app')
      },
    )

    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('+current app')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('new-file.ts'))

    await waitFor(() => {
      expect(screen.getByText('Loading diff...')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('app.ts'))

    await waitFor(() => {
      expect(screen.getByText('+current app')).toBeInTheDocument()
    })

    newFileDiff.resolve('@@ -1 +1 @@\n-old new file\n+late new file')
    await Promise.resolve()

    expect(screen.getByText('+current app')).toBeInTheDocument()
    expect(screen.queryByText('+late new file')).not.toBeInTheDocument()
  })

  it('renders current-file review notes as inline Pierre diff annotations', async () => {
    const notes = [
      makeReviewNote({
        id: 'note-draft',
        body: 'Draft inline note',
        state: 'draft',
        newStartLine: 1,
      }),
      makeReviewNote({
        id: 'note-sent',
        body: 'Sent inline note',
        state: 'sent',
        newStartLine: 1,
      }),
      makeReviewNote({
        id: 'note-resolved',
        body: 'Resolved inline note',
        state: 'resolved',
        newStartLine: 1,
      }),
    ]
    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const reviewNotes = electronAPI.reviewNotes as Record<
      string,
      ReturnType<typeof vi.fn>
    >
    reviewNotes.listBySession.mockResolvedValue(notes)

    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('diff-annotation-note-draft'),
      ).toHaveTextContent('Draft inline note')
      expect(screen.getByTestId('diff-annotation-note-sent')).toHaveTextContent(
        'Sent inline note',
      )
      expect(
        screen.getByTestId('diff-annotation-note-resolved'),
      ).toHaveTextContent('Resolved inline note')
    })

    expect(screen.getByTestId('diff-annotation-note-draft')).toHaveTextContent(
      'draft',
    )
    expect(screen.getByTestId('diff-annotation-note-sent')).toHaveTextContent(
      'sent',
    )
    expect(
      screen.getByTestId('diff-annotation-note-resolved'),
    ).toHaveTextContent('resolved')
  })

  it('marks stale current-file note anchors without hiding the tray note', async () => {
    const staleNote = makeReviewNote({
      id: 'note-stale',
      body: 'Stale inline note',
      newStartLine: 20,
      newEndLine: 20,
    })
    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const reviewNotes = electronAPI.reviewNotes as Record<
      string,
      ReturnType<typeof vi.fn>
    >
    reviewNotes.listBySession.mockResolvedValue([staleNote])

    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Stale inline note')).toBeInTheDocument()
      expect(screen.getByText('stale anchor')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('diff-annotation-note-stale')).toBeNull()
    expect(
      screen.getByTitle('Saved line anchor is not present in the current diff'),
    ).toBeInTheDocument()
  })

  it('filters review notes by state and resolves notes', async () => {
    const notes = [
      makeReviewNote({
        id: 'note-draft',
        body: 'Draft question',
        state: 'draft',
      }),
      makeReviewNote({
        id: 'note-sent',
        body: 'Sent question',
        state: 'sent',
      }),
      makeReviewNote({
        id: 'note-resolved',
        body: 'Resolved question',
        state: 'resolved',
      }),
    ]
    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const reviewNotes = electronAPI.reviewNotes as Record<
      string,
      ReturnType<typeof vi.fn>
    >
    reviewNotes.listBySession.mockResolvedValue(notes)

    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Draft question').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Sent question').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Resolved question').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sent 1' }))

    expect(screen.queryByText('Draft question')).not.toBeInTheDocument()
    expect(screen.getAllByText('Sent question').length).toBeGreaterThan(0)
    expect(screen.queryByText('Resolved question')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'All 3' }))
    fireEvent.click(screen.getAllByTitle('Resolve review note')[0]!)

    await waitFor(() => {
      expect(reviewNotes.update).toHaveBeenCalledWith('note-draft', {
        state: 'resolved',
      })
    })
  })

  it('previews an AI review packet from draft review notes', async () => {
    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const reviewNotes = electronAPI.reviewNotes as Record<
      string,
      ReturnType<typeof vi.fn>
    >
    const packetText =
      'Please help me understand these local code review notes.\n\nDo not change files unless I explicitly ask for fixes.'
    reviewNotes.listBySession.mockResolvedValue([
      makeReviewNote({
        id: 'note-app',
        body: 'Why this implementation?',
      }),
    ])
    reviewNotes.previewPacket.mockResolvedValue({
      noteCount: 1,
      text: packetText,
    })

    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Why this implementation?')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview packet/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Review packet preview')).toHaveValue(
        packetText,
      )
    })
    expect(reviewNotes.previewPacket).toHaveBeenCalledWith({
      sessionId: session.id,
    })
  })

  it('sends an AI review packet and marks sent notes in the tray', async () => {
    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const reviewNotes = electronAPI.reviewNotes as Record<
      string,
      ReturnType<typeof vi.fn>
    >
    reviewNotes.listBySession.mockResolvedValue([
      makeReviewNote({
        id: 'note-app',
        body: 'Question to send',
      }),
    ])

    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Question to send')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /ask ai/i }))

    await waitFor(() => {
      expect(screen.queryByText('1 draft note')).not.toBeInTheDocument()
    })
    expect(reviewNotes.sendPacket).toHaveBeenCalledWith({
      sessionId: session.id,
    })
  })

  it('renders the turn list when expanded and no turns exist yet', async () => {
    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={true}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Turns').length).toBeGreaterThan(0)
    })
    await waitFor(() => {
      expect(
        screen.getByText(
          'No turns yet. Changes will appear as the agent works.',
        ),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText('Files')).not.toBeInTheDocument()
  })

  it('switches to base branch mode and shows base branch diffs', async () => {
    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Base Branch' }))

    await waitFor(() => {
      expect(screen.getByText('Against beta (1)')).toBeInTheDocument()
    })

    expect(
      screen.getByText(
        'Changes compared with beta. Includes local uncommitted edits.',
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByText('base.ts').length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(screen.getByText('Diff against beta')).toBeInTheDocument()
      expect(screen.getByText('+new-base')).toBeInTheDocument()
    })

    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const git = electronAPI.git as Record<string, ReturnType<typeof vi.fn>>
    expect(git.getBaseBranchStatus).toHaveBeenCalledWith(session.id)
    expect(git.getBaseBranchDiff).toHaveBeenCalledWith(
      session.id,
      'src/base.ts',
    )
  })

  it('falls back to the stored note diff when a note jump cannot reload the live base diff', async () => {
    const staleNote = makeReviewNote({
      id: 'note-stale-base',
      filePath: 'src/stale.ts',
      mode: 'base-branch',
      newStartLine: 8,
      newEndLine: 8,
      hunkHeader: '@@ -8 +8 @@',
      selectedDiff: '+const storedAnswer = true',
      body: 'Why was this added?',
    })
    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const git = electronAPI.git as Record<string, ReturnType<typeof vi.fn>>
    const reviewNotes = electronAPI.reviewNotes as Record<
      string,
      ReturnType<typeof vi.fn>
    >
    reviewNotes.listBySession.mockResolvedValue([staleNote])
    git.getBaseBranchStatus.mockResolvedValue({
      base: {
        branchName: 'beta',
        comparisonRef: 'origin/beta',
        source: 'project-settings',
        warning: null,
      },
      files: [{ status: 'M', file: 'src/base.ts' }],
    })
    git.getBaseBranchDiff.mockResolvedValue('')

    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={false}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Why was this added?')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Why was this added?'))

    await waitFor(() => {
      expect(screen.getByText('Diff against beta')).toBeInTheDocument()
      expect(screen.getByText('+const storedAnswer = true')).toBeInTheDocument()
      expect(screen.getByText('1 line selected')).toBeInTheDocument()
      expect(screen.getByText('New 8')).toBeInTheDocument()
    })

    expect(git.getBaseBranchDiff).toHaveBeenCalledWith(
      session.id,
      'src/stale.ts',
    )
    expect(screen.queryByText('(no diff available)')).not.toBeInTheDocument()
  })

  it('renders turn cards and streaming turn.add deltas when expanded', async () => {
    const turns = [
      {
        id: 'turn-1',
        sessionId: session.id,
        sequence: 1,
        startedAt: '2026-04-23T10:00:00.000Z',
        endedAt: '2026-04-23T10:00:30.000Z',
        status: 'completed' as const,
        summary: 'Fixed login bug',
      },
    ]
    const fileChanges = [
      {
        id: 'change-1',
        sessionId: session.id,
        turnId: 'turn-1',
        filePath: 'src/login.ts',
        oldPath: null,
        status: 'modified' as const,
        additions: 4,
        deletions: 1,
        diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n',
        createdAt: '2026-04-23T10:00:30.000Z',
      },
    ]
    const electronAPI = (
      window as unknown as { electronAPI: Record<string, unknown> }
    ).electronAPI
    const turnsApiMock = {
      listForSession: vi.fn().mockResolvedValue(turns),
      getFileChanges: vi.fn().mockResolvedValue(fileChanges),
      getFileDiff: vi
        .fn()
        .mockResolvedValue('--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n'),
      onTurnDelta: vi.fn().mockReturnValue(() => {}),
    }
    ;(electronAPI.turns as Record<string, ReturnType<typeof vi.fn>>) =
      turnsApiMock

    render(
      <ChangedFilesPanel
        session={session}
        side="right"
        expanded={true}
        onClose={vi.fn()}
        onToggleSide={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Turn 1')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText('Fixed login bug')).toBeInTheDocument()
      expect(screen.getByText('1 file')).toBeInTheDocument()
      expect(screen.getByLabelText('Changed files tree')).toBeInTheDocument()
      expect(screen.getByText('login.ts')).toBeInTheDocument()
    })

    const getLoginTreeRow = () => screen.getAllByText('login.ts')[0]

    fireEvent.click(getLoginTreeRow())

    await waitFor(() => {
      expect(turnsApiMock.getFileDiff).toHaveBeenCalledWith(
        'turn-1',
        'src/login.ts',
      )
      expect(screen.getByText('Turn diff')).toBeInTheDocument()
      expect(screen.getByText('-old')).toBeInTheDocument()
      expect(screen.getByText('+new')).toBeInTheDocument()
    })

    fireEvent.click(getLoginTreeRow())

    expect(screen.getByText('Turn diff')).toBeInTheDocument()
    expect(screen.queryByText('Select a changed file from a turn')).toBeNull()
    expect(turnsApiMock.getFileDiff).toHaveBeenCalledTimes(1)
  })
})

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

function makeReviewNote(patch: Partial<ReviewNote>): ReviewNote {
  return {
    id: 'note-1',
    sessionId: session.id,
    workspaceId: session.workspaceId,
    filePath: 'src/app.ts',
    mode: 'working-tree',
    oldStartLine: null,
    oldEndLine: null,
    newStartLine: 1,
    newEndLine: 1,
    hunkHeader: '@@ -1 +1 @@',
    selectedDiff: '+line',
    body: 'Question',
    state: 'draft',
    sentAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}
