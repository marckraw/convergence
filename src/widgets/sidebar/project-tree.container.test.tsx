import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectTree } from './project-tree.container'

const project = {
  id: 'project-1',
  name: 'roomfinder',
  repositoryPath: '/tmp/roomfinder',
  settings: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('ProjectTree', () => {
  it('deletes a session without selecting it', () => {
    const onSelectSession = vi.fn()
    const onDeleteSession = vi.fn()

    render(
      <ProjectTree
        project={project}
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
        onCreateWorkspace={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /delete session hey there/i }),
    )

    expect(onDeleteSession).toHaveBeenCalledWith('session-1')
    expect(onSelectSession).not.toHaveBeenCalled()
  })
})
