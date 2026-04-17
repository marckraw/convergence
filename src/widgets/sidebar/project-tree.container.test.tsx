import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { ProjectTree } from './project-tree.container'

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
              id: 'session-1',
              projectId: 'project-1',
              workspaceId: null,
              providerId: 'claude-code',
              model: 'sonnet',
              effort: 'medium',
              name: 'hey there',
              status: 'completed',
              attention: 'finished',
              workingDirectory: '/tmp/roomfinder',
              transcript: [],
              archivedAt: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ]}
          activeSessionId={null}
          onSelectSession={onSelectSession}
          onArchiveSession={onArchiveSession}
          onUnarchiveSession={vi.fn()}
          onDeleteSession={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
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
              id: 'session-archived',
              projectId: 'project-1',
              workspaceId: null,
              providerId: 'claude-code',
              model: 'sonnet',
              effort: 'medium',
              name: 'archived note',
              status: 'completed',
              attention: 'finished',
              workingDirectory: '/tmp/roomfinder',
              transcript: [],
              archivedAt: '2026-01-02T00:00:00.000Z',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
          ]}
          activeSessionId={null}
          onSelectSession={vi.fn()}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={onUnarchiveSession}
          onDeleteSession={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
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
          onDeleteWorkspace={onDeleteWorkspace}
          onCreateWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /delete workspace feature-branch/i }),
    )

    expect(onDeleteWorkspace).toHaveBeenCalledWith('workspace-1')
  })
})
