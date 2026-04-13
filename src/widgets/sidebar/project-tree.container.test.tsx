import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { ProjectTree } from './project-tree.container'

describe('ProjectTree', () => {
  it('deletes a session without selecting it', () => {
    const onSelectSession = vi.fn()
    const onDeleteSession = vi.fn()

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
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ]}
          activeSessionId={null}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
          onDeleteWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /delete session hey there/i }),
    )

    expect(onDeleteSession).toHaveBeenCalledWith('session-1')
    expect(onSelectSession).not.toHaveBeenCalled()
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
