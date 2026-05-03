import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, useProjectStore } from '@/entities/project'
import { useDialogStore } from '@/entities/dialog'
import { useInitiativeStore } from '@/entities/initiative'
import { useSessionStore } from '@/entities/session'
import { useWorkspaceStore } from '@/entities/workspace'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { SessionView } from './session-view.container'

vi.mock('@/features/composer', () => ({
  ComposerContainer: () => <div>composer</div>,
}))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    count: number
    estimateSize: (index: number) => number
    getItemKey?: (index: number) => string | number | bigint
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: options.getItemKey?.(index) ?? index,
        start: index * options.estimateSize(index),
      })),
    getTotalSize: () =>
      Array.from({ length: options.count }, (_, index) =>
        options.estimateSize(index),
      ).reduce((total, size) => total + size, 0),
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}))

const initiative = {
  id: 'initiative-1',
  title: 'Agent-native initiatives',
  status: 'exploring' as const,
  attention: 'none' as const,
  currentUnderstanding: 'Keep the session and Initiative visible together.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const attempt = {
  id: 'attempt-1',
  initiativeId: 'initiative-1',
  sessionId: 'session-1',
  role: 'seed' as const,
  isPrimary: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

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

    useWorkspaceStore.setState({
      workspaces: [],
      globalWorkspaces: [
        {
          id: 'workspace-1',
          projectId: 'project-1',
          branchName: 'feat/initiative-panel',
          path: '/tmp/project',
          type: 'worktree',
          archivedAt: null,
          worktreeRemovedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      currentBranch: null,
      loading: false,
      error: null,
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
          primarySurface: 'conversation' as const,
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

    useDialogStore.setState({ openDialog: null, payload: null })
    useInitiativeStore.setState({
      initiatives: [],
      attemptsByInitiativeId: {},
      attemptsBySessionId: {},
      outputsByInitiativeId: {},
      loading: false,
      error: null,
    })

    Object.defineProperty(window, 'electronAPI', {
      value: {
        initiative: {
          list: vi.fn().mockResolvedValue([initiative]),
          getById: vi.fn().mockResolvedValue(initiative),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          listAttempts: vi.fn().mockResolvedValue([attempt]),
          listAttemptsForSession: vi.fn().mockResolvedValue([]),
          linkAttempt: vi.fn(),
          updateAttempt: vi.fn(),
          unlinkAttempt: vi.fn(),
          setPrimaryAttempt: vi.fn(),
          listOutputs: vi.fn().mockResolvedValue([]),
          addOutput: vi.fn(),
          updateOutput: vi.fn(),
          deleteOutput: vi.fn(),
          synthesize: vi.fn(),
        },
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
        attachments: {
          getForSession: vi.fn().mockResolvedValue([]),
          getById: vi.fn().mockResolvedValue(null),
          ingestFiles: vi.fn().mockResolvedValue({
            attachments: [],
            rejections: [],
          }),
          ingestFromPaths: vi.fn().mockResolvedValue({
            attachments: [],
            rejections: [],
          }),
          readBytes: vi.fn().mockResolvedValue(new Uint8Array()),
          delete: vi.fn().mockResolvedValue(undefined),
          showOpenDialog: vi.fn().mockResolvedValue([]),
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

  it('does not expose actions for stale approval cards on inactive sessions', () => {
    useSessionStore.setState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? { ...session, status: 'completed', attention: 'needs-approval' }
          : session,
      ),
      activeConversation: [
        {
          id: 'approval-1',
          sessionId: 'session-1',
          sequence: 1,
          turnId: 'turn-1',
          kind: 'approval-request',
          description: 'Command: git status',
          state: 'complete',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          providerMeta: {
            providerId: 'claude-code',
            providerItemId: null,
            providerEventType: 'item/commandExecution/requestApproval',
          },
        },
      ],
    }))

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    expect(screen.getByText('Approval needed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull()
  })

  it('keeps the latest approval card actionable even after later notes', () => {
    useSessionStore.setState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? { ...session, status: 'running', attention: 'needs-approval' }
          : session,
      ),
      activeConversation: [
        {
          id: 'approval-1',
          sessionId: 'session-1',
          sequence: 1,
          turnId: 'turn-1',
          kind: 'approval-request',
          description: 'Allow the linear MCP server to run tool save_issue?',
          state: 'complete',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          providerMeta: {
            providerId: 'codex',
            providerItemId: null,
            providerEventType: 'mcpServer/elicitation/request',
          },
        },
        {
          id: 'note-1',
          sessionId: 'session-1',
          sequence: 2,
          turnId: 'turn-1',
          kind: 'note',
          level: 'warning',
          text: 'No provider events for 60s. Still waiting; this can be normal for long reasoning steps.',
          state: 'complete',
          createdAt: '2026-01-01T00:01:00.000Z',
          updatedAt: '2026-01-01T00:01:00.000Z',
          providerMeta: {
            providerId: 'convergence',
            providerItemId: null,
            providerEventType: 'liveness.quiet',
          },
        },
      ],
    }))

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    expect(screen.getByText('Approval needed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument()
  })

  it('renders boot context as revealable metadata on the first user message', async () => {
    useSessionStore.setState((state) => ({
      ...state,
      activeConversation: [
        {
          id: 'context-note-1',
          sessionId: 'session-1',
          sequence: 1,
          turnId: null,
          kind: 'note',
          level: 'info',
          text: '<convergence:context>\nchaperone project\n/Users/marckraw/Projects/OpenSource/chaperone\n</convergence:context>',
          state: 'complete',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          providerMeta: {
            providerId: 'convergence',
            providerItemId: null,
            providerEventType: 'context.boot',
          },
        },
        {
          id: 'user-message-1',
          sessionId: 'session-1',
          sequence: 2,
          turnId: 'turn-1',
          kind: 'message',
          actor: 'user',
          text: 'do you have a chaperone project path ?',
          state: 'complete',
          createdAt: '2026-01-01T00:00:01.000Z',
          updatedAt: '2026-01-01T00:00:01.000Z',
          providerMeta: {
            providerId: 'claude-code',
            providerItemId: null,
            providerEventType: 'user',
          },
        },
      ],
    }))

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    expect(
      await screen.findByText('do you have a chaperone project path ?'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('injected-context-details')).not.toHaveAttribute(
      'open',
    )

    fireEvent.click(screen.getByText('Injected context'))

    expect(screen.getByTestId('injected-context-details')).toHaveTextContent(
      '/Users/marckraw/Projects/OpenSource/chaperone',
    )
    expect(screen.getByTestId('injected-context-details')).toHaveAttribute(
      'open',
    )
  })

  it('opens the Initiative link dialog from session actions', async () => {
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /session actions/i }),
    )
    fireEvent.click(await screen.findByText('Link to Initiative...'))

    expect(useDialogStore.getState().openDialog).toBe('initiative-session-link')
    expect(useDialogStore.getState().payload).toEqual({
      sessionId: 'session-1',
    })
  })

  it('does not render the Initiative context panel for an unlinked session', () => {
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    expect(screen.queryByTestId('initiative-context-panel')).toBeNull()
  })

  it('renders Initiative context for a linked session and opens the Workboard', async () => {
    vi.mocked(
      window.electronAPI.initiative.listAttemptsForSession,
    ).mockResolvedValue([attempt])
    useInitiativeStore.setState({
      initiatives: [initiative],
      attemptsByInitiativeId: { 'initiative-1': [attempt] },
      attemptsBySessionId: { 'session-1': [attempt] },
      outputsByInitiativeId: {},
      loading: false,
      error: null,
    })

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    expect(screen.getByTestId('initiative-context-panel')).toBeInTheDocument()
    expect(screen.getByText('Agent-native initiatives')).toBeInTheDocument()
    expect(
      screen.getByText('Keep the session and Initiative visible together.'),
    ).toBeInTheDocument()
    expect(screen.getByText('feat/initiative-panel')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: /open initiative agent-native initiatives/i,
      }),
    )

    expect(useDialogStore.getState().openDialog).toBe('initiative-workboard')
    expect(useDialogStore.getState().payload).toEqual({
      initiativeId: 'initiative-1',
    })
  })
})
