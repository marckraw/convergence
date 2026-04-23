import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('ChangedFilesPanel', () => {
  beforeEach(() => {
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
        },
        turns: {
          listForSession: vi.fn().mockResolvedValue([]),
          getFileChanges: vi.fn().mockResolvedValue([]),
          getFileDiff: vi.fn().mockResolvedValue(''),
          onTurnDelta: vi.fn().mockReturnValue(() => {}),
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
      expect(screen.getByText('Turns')).toBeInTheDocument()
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
