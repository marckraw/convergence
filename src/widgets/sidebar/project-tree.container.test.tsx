import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { ProjectTree } from './project-tree.container'

const baseSession = {
  projectId: 'project-1',
  workspaceId: null,
  model: 'sonnet',
  effort: 'medium' as const,
  status: 'completed' as const,
  attention: 'finished' as const,
  activity: null,
  contextWindow: null,
  workingDirectory: '/tmp/roomfinder',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation' as const,
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('ProjectTree', () => {
  it('archives a session without selecting it', async () => {
    const onSelectSession = vi.fn()
    const onArchiveSession = vi.fn()

    render(
      <TooltipProvider>
        <ProjectTree
          baseBranchName="master"
          workspaces={[]}
          sessions={[
            {
              ...baseSession,
              id: 'session-1',
              providerId: 'claude-code',
              name: 'hey there',
            },
          ]}
          activeSessionId={null}
          onSelectSession={onSelectSession}
          onArchiveSession={onArchiveSession}
          onUnarchiveSession={vi.fn()}
          onDeleteSession={vi.fn()}
          onRenameSession={vi.fn()}
          onRegenerateSessionName={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onOpenCreateWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /session actions hey there/i }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /archive session/i }),
    )

    expect(onArchiveSession).toHaveBeenCalledWith('session-1')
    expect(onSelectSession).not.toHaveBeenCalled()
  })

  it('unarchives a session from the archived section', async () => {
    const onUnarchiveSession = vi.fn()

    render(
      <TooltipProvider>
        <ProjectTree
          baseBranchName="master"
          workspaces={[]}
          sessions={[
            {
              ...baseSession,
              id: 'session-archived',
              providerId: 'claude-code',
              name: 'archived note',
              archivedAt: '2026-01-02T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
          ]}
          activeSessionId={null}
          onSelectSession={vi.fn()}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={onUnarchiveSession}
          onDeleteSession={vi.fn()}
          onRenameSession={vi.fn()}
          onRegenerateSessionName={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onOpenCreateWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /archived/i }))
    fireEvent.pointerDown(
      screen.getByRole('button', { name: /session actions archived note/i }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /unarchive session/i }),
    )

    expect(onUnarchiveSession).toHaveBeenCalledWith('session-archived')
  })

  it('shows regenerate name for conversation sessions', async () => {
    render(
      <TooltipProvider>
        <ProjectTree
          baseBranchName="master"
          workspaces={[]}
          sessions={[
            {
              ...baseSession,
              id: 'conversation-session',
              providerId: 'claude-code',
              name: 'conversation note',
            },
          ]}
          activeSessionId={null}
          onSelectSession={vi.fn()}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={vi.fn()}
          onDeleteSession={vi.fn()}
          onRenameSession={vi.fn()}
          onRegenerateSessionName={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onOpenCreateWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: /session actions conversation note/i,
      }),
    )

    expect(
      await screen.findByRole('menuitem', { name: /regenerate name/i }),
    ).toBeInTheDocument()
  })

  it('hides regenerate name for shell sessions', async () => {
    render(
      <TooltipProvider>
        <ProjectTree
          baseBranchName="master"
          workspaces={[]}
          sessions={[
            {
              ...baseSession,
              id: 'terminal-session',
              providerId: 'shell',
              name: 'terminal note',
              model: null,
              effort: null,
              primarySurface: 'terminal',
            },
          ]}
          activeSessionId={null}
          onSelectSession={vi.fn()}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={vi.fn()}
          onDeleteSession={vi.fn()}
          onRenameSession={vi.fn()}
          onRegenerateSessionName={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onOpenCreateWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /session actions terminal note/i }),
    )

    expect(
      screen.queryByRole('menuitem', { name: /regenerate name/i }),
    ).toBeNull()
    expect(
      await screen.findByRole('menuitem', { name: /^rename$/i }),
    ).toBeInTheDocument()
  })

  it('deletes a workspace without toggling it open', () => {
    const onDeleteWorkspace = vi.fn()

    render(
      <TooltipProvider>
        <ProjectTree
          baseBranchName="staging"
          workspaces={[
            {
              id: 'workspace-1',
              projectId: 'project-1',
              branchName: 'feature-branch',
              path: '/tmp/roomfinder-workspace',
              type: 'worktree',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ]}
          sessions={[]}
          activeSessionId={null}
          onSelectSession={vi.fn()}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={vi.fn()}
          onDeleteSession={vi.fn()}
          onRenameSession={vi.fn()}
          onRegenerateSessionName={vi.fn()}
          onDeleteWorkspace={onDeleteWorkspace}
          onOpenCreateWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /delete workspace feature-branch/i }),
    )

    expect(onDeleteWorkspace).toHaveBeenCalledWith('workspace-1')
  })
})
