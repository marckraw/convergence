import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { SessionView } from './session-view.container'

vi.mock('@/features/composer', () => ({
  ComposerContainer: () => <div>composer</div>,
}))

describe('SessionView changed files drawer', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()

    useProjectStore.setState({
      projects: [],
      activeProject: {
        id: 'project-1',
        name: 'convergence',
        repositoryPath: '/tmp/project',
        settings: DEFAULT_PROJECT_SETTINGS,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      loading: false,
      error: null,
      loadProjects: vi.fn(),
      loadActiveProject: vi.fn(),
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      setActiveProject: vi.fn(),
      updateProjectSettings: vi.fn(),
      clearError: vi.fn(),
    })

    useSessionStore.setState({
      sessions: [
        {
          id: 'session-1',
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          providerId: 'claude-code',
          model: 'sonnet',
          effort: 'medium',
          name: 'Test session',
          status: 'completed',
          attention: 'finished',
          activity: null,
          workingDirectory: '/tmp/project',
          contextWindow: {
            availability: 'available',
            source: 'provider',
            usedTokens: 40000,
            windowTokens: 200000,
            usedPercentage: 20,
            remainingPercentage: 80,
          },
          archivedAt: null,
          parentSessionId: null,
          forkStrategy: null,
          continuationToken: null,
          lastSequence: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      activeConversation: [],
      activeConversationSessionId: 'session-1',
      activeSessionId: 'session-1',
      draftWorkspaceId: null,
      providers: [],
      error: null,
      loadSessions: vi.fn(),
      loadProviders: vi.fn(),
      createAndStartSession: vi.fn(),
      approveSession: vi.fn(),
      denySession: vi.fn(),
      sendMessageToSession: vi.fn(),
      stopSession: vi.fn(),
      deleteSession: vi.fn(),
      beginSessionDraft: vi.fn(),
      setActiveSession: vi.fn(),
      handleSessionSummaryUpdate: vi.fn(),
      handleConversationPatched: vi.fn(),
      clearError: vi.fn(),
    })

    Object.defineProperty(window, 'electronAPI', {
      value: {
        git: {
          getCurrentBranch: vi.fn().mockResolvedValue('master'),
          getStatus: vi
            .fn()
            .mockResolvedValue([{ status: 'M', file: 'src/app.ts' }]),
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

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('toggles changed files between docked and overlay modes', async () => {
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    expect(screen.getByText('80% left')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Changed files' }))

    await waitFor(() => {
      expect(screen.getByTitle('Use wide width')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Use wide width'))

    await waitFor(() => {
      expect(screen.getByTitle('Use compact width')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Use compact width'))

    await waitFor(() => {
      expect(screen.getByTitle('Use wide width')).toBeInTheDocument()
    })
  })

  it('shows the live session activity in the header', async () => {
    useSessionStore.setState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? { ...session, status: 'running', activity: 'compacting' }
          : session,
      ),
    }))

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    expect(screen.getByTestId('session-activity-indicator')).toHaveTextContent(
      'compacting context…',
    )
  })
})
