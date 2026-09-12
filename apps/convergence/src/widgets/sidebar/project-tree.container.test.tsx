import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { ProjectTree } from './project-tree.container'

const mergedPullRequest = {
  id: 'pr-1',
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  provider: 'github' as const,
  lookupStatus: 'found' as const,
  state: 'merged' as const,
  repositoryOwner: 'example',
  repositoryName: 'repo',
  number: 12,
  title: 'Merged workspace',
  url: 'https://github.com/example/repo/pull/12',
  isDraft: false,
  headBranch: 'feature-branch',
  baseBranch: 'main',
  mergedAt: '2026-01-02T00:00:00.000Z',
  lastCheckedAt: '2026-01-02T00:00:00.000Z',
  error: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const baseSession = {
  contextKind: 'project' as const,
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
  it('expands only the selected conversation and preserves independent actions and rename', () => {
    const onSelectSession = vi.fn()
    const onRenameSession = vi.fn()
    const sessions = [
      {
        ...baseSession,
        id: 'one',
        providerId: 'codex',
        name: 'First conversation',
        executionHost: 'server',
        originKind: 'resident' as const,
        pullRequest: {
          number: 42,
          state: 'open' as const,
          url: 'https://github.com/example/repo/pull/42',
          headBranch: 'work',
          checkedAt: baseSession.updatedAt,
          source: 'gh' as const,
        },
      },
      {
        ...baseSession,
        id: 'two',
        providerId: 'claude-code',
        name: 'Second conversation',
      },
      { ...baseSession, id: 'shell', providerId: 'shell', name: 'Terminal' },
    ]
    const props = {
      cardContext: {
        projectName: 'Convergence',
        endpoints: [{ id: 'server', label: 'little-monster' }],
        now: Date.parse('2026-01-02T00:00:00Z'),
      },
      baseBranchName: 'master',
      workspaces: [],
      sessions,
      onSelectSession,
      onRenameSession,
      onArchiveSession: vi.fn(),
      onUnarchiveSession: vi.fn(),
      onDeleteSession: vi.fn(),
      onRegenerateSessionName: vi.fn(),
      onDeleteWorkspace: vi.fn(),
      onOpenCreateWorkspace: vi.fn(),
    }
    const view = render(
      <TooltipProvider>
        <ProjectTree {...props} activeSessionId="one" />
      </TooltipProvider>,
    )
    expect(
      screen
        .getByRole('button', { name: 'First conversation' })
        .closest('article'),
    ).toHaveAttribute('data-density', 'expanded')
    expect(
      screen
        .getByRole('button', { name: 'Second conversation' })
        .closest('article'),
    ).toHaveAttribute('data-density', 'compact')
    expect(
      screen
        .getByRole('button', { name: /Terminal session\s*Terminal/ })
        .closest('article'),
    ).toBeNull()
    const pr = screen.getByRole('link', { name: /Pull request #42/ })
    fireEvent.click(pr)
    expect(onSelectSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Second conversation' }))
    expect(onSelectSession).toHaveBeenCalledExactlyOnceWith('two')
    view.rerender(
      <TooltipProvider>
        <ProjectTree {...props} activeSessionId="two" />
      </TooltipProvider>,
    )
    expect(
      screen
        .getByRole('button', { name: 'First conversation' })
        .closest('article'),
    ).toHaveAttribute('data-density', 'compact')
    expect(
      screen.getByRole('button', { name: 'Second conversation' }),
    ).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByRole('link', { name: /Pull request #42/ })).toBeNull()
    fireEvent.doubleClick(
      screen.getByRole('button', { name: 'First conversation' }),
    )
    const rename = screen.getByRole('textbox', {
      name: 'Rename First conversation',
    })
    fireEvent.change(rename, { target: { value: 'Renamed conversation' } })
    fireEvent.submit(rename.closest('form')!)
    expect(onRenameSession).toHaveBeenCalledExactlyOnceWith(
      'one',
      'Renamed conversation',
    )
    expect(
      screen
        .getByRole('button', { name: 'First conversation' })
        .closest('article'),
    ).toHaveAttribute('data-density', 'compact')
  })

  it('archives a session without selecting it', async () => {
    const onSelectSession = vi.fn()
    const onArchiveSession = vi.fn()

    render(
      <TooltipProvider>
        <ProjectTree
          cardContext={{
            projectName: 'Convergence',
            endpoints: [],
            now: Date.parse('2026-01-02T00:00:00Z'),
          }}
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
          cardContext={{
            projectName: 'Convergence',
            endpoints: [],
            now: Date.parse('2026-01-02T00:00:00Z'),
          }}
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

    fireEvent.click(
      screen.getByRole('button', {
        name: /expand archived workspaces and sessions/i,
      }),
    )
    fireEvent.pointerDown(
      screen.getByRole('button', { name: /session actions archived note/i }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /unarchive session/i }),
    )

    expect(onUnarchiveSession).toHaveBeenCalledWith('session-archived')
  })

  it('auto-opens archived for the active archived session but still allows manual collapse', async () => {
    render(
      <TooltipProvider>
        <ProjectTree
          cardContext={{
            projectName: 'Convergence',
            endpoints: [],
            now: Date.parse('2026-01-02T00:00:00Z'),
          }}
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
          activeSessionId="session-archived"
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

    expect(await screen.findByText('archived note')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: /collapse archived workspaces and sessions/i,
      }),
    )

    expect(screen.queryByText('archived note')).toBeNull()
  })

  it('shows regenerate name for conversation sessions', async () => {
    const onRegenerateSessionName = vi.fn()
    render(
      <TooltipProvider>
        <ProjectTree
          cardContext={{
            projectName: 'Convergence',
            endpoints: [],
            now: Date.parse('2026-01-02T00:00:00Z'),
          }}
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
          onRegenerateSessionName={onRegenerateSessionName}
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

    fireEvent.click(screen.getByRole('menuitem', { name: /regenerate name/i }))

    expect(onRegenerateSessionName).toHaveBeenCalledWith('conversation-session')
  })

  it('shows row progress while a session name is regenerating', () => {
    render(
      <TooltipProvider>
        <ProjectTree
          cardContext={{
            projectName: 'Convergence',
            endpoints: [],
            now: Date.parse('2026-01-02T00:00:00Z'),
          }}
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
          regeneratingSessionIds={new Set(['conversation-session'])}
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

    expect(screen.getByLabelText('Regenerating name')).toBeInTheDocument()
  })

  it('hides regenerate name for shell sessions', async () => {
    render(
      <TooltipProvider>
        <ProjectTree
          cardContext={{
            projectName: 'Convergence',
            endpoints: [],
            now: Date.parse('2026-01-02T00:00:00Z'),
          }}
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

  it('renders a merged badge for a workspace with a merged PR', () => {
    render(
      <TooltipProvider>
        <ProjectTree
          cardContext={{
            projectName: 'Convergence',
            endpoints: [],
            now: Date.parse('2026-01-02T00:00:00Z'),
          }}
          baseBranchName="staging"
          workspaces={[
            {
              id: 'workspace-1',
              projectId: 'project-1',
              branchName: 'feature-branch',
              path: '/tmp/roomfinder-workspace',
              type: 'worktree',
              archivedAt: null,
              worktreeRemovedAt: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ]}
          sessions={[]}
          activeSessionId={null}
          pullRequestsByWorkspaceId={{ 'workspace-1': mergedPullRequest }}
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

    expect(screen.getByText('Merged')).toBeInTheDocument()
  })

  it('archives a workspace from the workspace actions menu', async () => {
    const onArchiveWorkspace = vi.fn()

    render(
      <TooltipProvider>
        <ProjectTree
          cardContext={{
            projectName: 'Convergence',
            endpoints: [],
            now: Date.parse('2026-01-02T00:00:00Z'),
          }}
          baseBranchName="staging"
          workspaces={[
            {
              id: 'workspace-1',
              projectId: 'project-1',
              branchName: 'feature-branch',
              path: '/tmp/roomfinder-workspace',
              type: 'worktree',
              archivedAt: null,
              worktreeRemovedAt: null,
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
          onArchiveWorkspace={onArchiveWorkspace}
          onDeleteWorkspace={vi.fn()}
          onOpenCreateWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /workspace actions feature-branch/i }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /archive workspace/i }),
    )

    expect(onArchiveWorkspace).toHaveBeenCalledWith('workspace-1')
  })

  it('shows archived workspaces in the archived section and unarchives them', async () => {
    const onUnarchiveWorkspace = vi.fn()

    render(
      <TooltipProvider>
        <ProjectTree
          cardContext={{
            projectName: 'Convergence',
            endpoints: [],
            now: Date.parse('2026-01-02T00:00:00Z'),
          }}
          baseBranchName="staging"
          workspaces={[
            {
              id: 'workspace-1',
              projectId: 'project-1',
              branchName: 'feature-branch',
              path: '/tmp/roomfinder-workspace',
              type: 'worktree',
              archivedAt: '2026-01-02T00:00:00.000Z',
              worktreeRemovedAt: '2026-01-02T00:00:00.000Z',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ]}
          sessions={[
            {
              ...baseSession,
              id: 'session-1',
              workspaceId: 'workspace-1',
              providerId: 'claude-code',
              name: 'archived workspace session',
              archivedAt: '2026-01-02T00:00:00.000Z',
            },
          ]}
          activeSessionId={null}
          onSelectSession={vi.fn()}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={vi.fn()}
          onDeleteSession={vi.fn()}
          onRenameSession={vi.fn()}
          onRegenerateSessionName={vi.fn()}
          onUnarchiveWorkspace={onUnarchiveWorkspace}
          onDeleteWorkspace={vi.fn()}
          onOpenCreateWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    )

    expect(screen.queryByRole('button', { name: /feature-branch/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /archived/i }))

    expect(screen.getByText('feature-branch')).toBeInTheDocument()
    expect(screen.getByText('Worktree removed')).toBeInTheDocument()

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /workspace actions feature-branch/i }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /unarchive workspace/i }),
    )

    expect(onUnarchiveWorkspace).toHaveBeenCalledWith('workspace-1')
  })

  it('removes a workspace worktree from the workspace actions menu', async () => {
    const onRemoveWorkspaceWorktree = vi.fn()

    render(
      <TooltipProvider>
        <ProjectTree
          cardContext={{
            projectName: 'Convergence',
            endpoints: [],
            now: Date.parse('2026-01-02T00:00:00Z'),
          }}
          baseBranchName="staging"
          workspaces={[
            {
              id: 'workspace-1',
              projectId: 'project-1',
              branchName: 'feature-branch',
              path: '/tmp/roomfinder-workspace',
              type: 'worktree',
              archivedAt: null,
              worktreeRemovedAt: null,
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
          onRemoveWorkspaceWorktree={onRemoveWorkspaceWorktree}
          onDeleteWorkspace={vi.fn()}
          onOpenCreateWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /workspace actions feature-branch/i }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: /remove worktree from disk/i,
      }),
    )

    expect(onRemoveWorkspaceWorktree).toHaveBeenCalledWith('workspace-1')
  })

  it('deletes a workspace permanently from the workspace actions menu', async () => {
    const onDeleteWorkspace = vi.fn()

    render(
      <TooltipProvider>
        <ProjectTree
          cardContext={{
            projectName: 'Convergence',
            endpoints: [],
            now: Date.parse('2026-01-02T00:00:00Z'),
          }}
          baseBranchName="staging"
          workspaces={[
            {
              id: 'workspace-1',
              projectId: 'project-1',
              branchName: 'feature-branch',
              path: '/tmp/roomfinder-workspace',
              type: 'worktree',
              archivedAt: null,
              worktreeRemovedAt: null,
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

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /workspace actions feature-branch/i }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /delete permanently/i }),
    )

    expect(onDeleteWorkspace).toHaveBeenCalledWith('workspace-1')
  })
})
