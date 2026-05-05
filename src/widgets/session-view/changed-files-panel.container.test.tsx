import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReviewNoteStore, type ReviewNote } from '@/entities/review-note'
import { ChangedFilesPanel } from './changed-files-panel.container'

const session = {
  id: 'session-1',
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

    await waitFor(() => {
      expect(screen.getByText('Current workspace diff')).toBeInTheDocument()
      expect(screen.getByText('app.ts')).toBeInTheDocument()
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
      expect(screen.getByText('Why did this change?')).toBeInTheDocument()
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
    expect(screen.getByText('Question on app')).toBeInTheDocument()
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
    expect(screen.getByText('base.ts')).toBeInTheDocument()

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
    ;(electronAPI.turns as Record<string, ReturnType<typeof vi.fn>>) = {
      listForSession: vi.fn().mockResolvedValue(turns),
      getFileChanges: vi.fn().mockResolvedValue(fileChanges),
      getFileDiff: vi
        .fn()
        .mockResolvedValue('--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n'),
      onTurnDelta: vi.fn().mockReturnValue(() => {}),
    }

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
      expect(screen.getByText('login.ts')).toBeInTheDocument()
    })
  })
})

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
