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
  workingDirectory: '/tmp/project',
  transcript: [],
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
})
