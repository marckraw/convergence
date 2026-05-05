import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReviewNoteStore } from '@/entities/review-note'
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
