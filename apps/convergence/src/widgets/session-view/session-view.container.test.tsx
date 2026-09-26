import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, useProjectStore } from '@/entities/project'
import { useDialogStore } from '@/entities/dialog'
import { useSpaceStore } from '@/entities/space'
import { useSessionStore } from '@/entities/session'
import { useContextDrillStore } from '@/entities/context-drill'
import { useSessionRelayStore } from '@/entities/session-relay'
import { useProjectScriptStore } from '@/entities/project-script'
import { useWorkspaceStore } from '@/entities/workspace'
import { useTerminalStore } from '@/entities/terminal'
import { useAgentMeterStore } from '@/entities/agent-meter'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useTranscriptViewStore } from './transcript-view.model'
import { TooltipProvider } from '@/shared/ui/tooltip'
import type { SessionAgentRun } from '@/shared/types/harness-evidence.types'
const navigationScroll = vi.hoisted(() => vi.fn())
// Every context the composer was handed, in order (MAR-3325).
const composerContexts = vi.hoisted((): unknown[] => [])
import { SessionView } from './session-view.container'

/**
 * jsdom lays nothing out, so the session row measures 0 and Parallel work
 * opens as the overlay (MAR-3426). Tests of the docked panel give the row --
 * and only the row -- a width.
 */
function sessionRowWidth(width: number) {
  const measure = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return this.hasAttribute('data-session-row')
        ? ({ width } as DOMRect)
        : measure.call(this)
    },
  )
}

/**
 * A laid-out conversation header (MAR-3427): the header measures `width`, each
 * drawn control `itemWidth`, and the two names their own natural widths. A
 * control that renders nothing measures nothing, as in the browser.
 */
function headerWidth(width: number, itemWidth = 90) {
  const measure = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute('data-conversation-header'))
        return { width } as DOMRect
      if (this.hasAttribute('data-header-inner'))
        return {
          width: this.childElementCount > 0 ? itemWidth : 0,
        } as DOMRect
      return measure.call(this)
    },
  )
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute('data-header-project')) return 90
      if (this.hasAttribute('data-header-name')) return 200
      return 0
    },
  )
}

vi.mock('@/features/composer', () => ({
  ComposerContainer: ({
    context,
    wiresSlot,
  }: {
    context: unknown
    wiresSlot?: React.ReactNode
  }) => {
    composerContexts.push(context)
    return (
      <div data-testid="composer">
        composer
        {wiresSlot}
      </div>
    )
  },
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
    scrollToIndex: navigationScroll,
  }),
}))

const space = {
  id: 'space-1',
  title: 'Agent-native spaces',
  status: 'exploring' as const,
  attention: 'none' as const,
  brief: 'Keep the session and Space visible together.',
  memory: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const attempt = {
  id: 'attempt-1',
  spaceId: 'space-1',
  sessionId: 'session-1',
  role: 'seed' as const,
  isPrimary: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const sidebarProject = {
  id: 'project-1',
  name: 'convergence',
  repositoryPath: '/tmp/project',
  settings: DEFAULT_PROJECT_SETTINGS,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  laneOf: null,
  laneName: null,
}

const devScript = {
  id: 'script-1',
  projectId: 'project-1',
  name: 'Dev',
  command: 'npm run dev',
  icon: 'play' as const,
  cwd: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const devRun = {
  id: 'run-1',
  scriptId: devScript.id,
  projectId: 'project-1',
  command: devScript.command,
  cwd: '/tmp/project',
  status: 'queued' as const,
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: null,
  exitCode: null,
  signal: null,
  errorMessage: null,
  stdout: '',
  stderr: '',
}

/** One task running: Parallel work holds its place in the row (CH4 R2). */
const oneRunning = { running: 1, unknown: 0, failed: 0, stopped: 0 }
const runParallel = () =>
  useSessionStore.setState((state) => ({
    sessions: state.sessions.map((session) => ({
      ...session,
      parallelWork: oneRunning,
    })),
  }))

/** Opens one of the header's groups (MAR-3429 CH4) from its trigger. */
const openGroup = (name: 'View' | 'Details' | 'Project' | 'Session actions') =>
  fireEvent.pointerDown(screen.getByRole('button', { name }))

describe('SessionView', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()

    useProjectStore.setState({
      projects: [sidebarProject],
      activeProject: {
        id: 'project-1',
        name: 'convergence',
        repositoryPath: '/tmp/project',
        settings: DEFAULT_PROJECT_SETTINGS,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        laneOf: null,
        laneName: null,
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
          branchName: 'feat/space-panel',
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

    useSessionRelayStore.setState({ relays: [], isLoaded: true })

    useSessionStore.setState({
      sessions: [
        {
          id: 'session-1',
          contextKind: 'project',
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
      providerCatalogs: {},
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
    useSpaceStore.setState({
      spaces: [],
      attemptsBySpaceId: {},
      attemptsBySessionId: {},
      artifactsBySpaceId: {},
      sourcesBySpaceId: {},
      loading: false,
      error: null,
    })
    useProjectScriptStore.setState({
      scriptsByProjectId: {},
      runsByProjectId: {},
      globalActiveRuns: [],
      outputByRunId: {},
      loading: false,
      error: null,
    })

    Object.defineProperty(window, 'electronAPI', {
      value: {
        pullRequest: {
          getForSession: vi.fn().mockResolvedValue({
            pullRequest: null,
            branchName: 'agent/34372e47',
            message: 'PR unknown — gh not found',
          }),
          refreshForSession: vi.fn().mockResolvedValue({
            pullRequest: null,
            branchName: 'agent/34372e47',
            message: 'PR unknown — gh not found',
          }),
        },
        session: {
          harnessFacts: vi.fn().mockResolvedValue({
            turns: [],
            currentTurn: null,
            compactions: [],
            rateLimit: null,
            init: null,
          }),
          onHarnessFacts: vi.fn().mockReturnValue(() => {}),
          refreshMcpServers: vi.fn().mockResolvedValue(undefined),
          onSessionSummaryUpdate: vi.fn().mockReturnValue(() => {}),
          listAgentRuns: vi.fn().mockResolvedValue([]),
          listTasks: vi.fn().mockResolvedValue([]),
          listTaskItems: vi.fn().mockResolvedValue([]),
          listTaskResultNotes: vi.fn().mockResolvedValue([]),
          listRunItems: vi.fn().mockResolvedValue([]),
          onSessionConversationPatched: vi.fn().mockReturnValue(() => {}),
          onEvidenceUpdated: vi.fn().mockReturnValue(() => {}),
        },
        projectScripts: {
          list: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          listRuns: vi.fn().mockResolvedValue([]),
          listActiveRuns: vi.fn().mockResolvedValue([]),
          getRun: vi.fn().mockResolvedValue(null),
          run: vi.fn(),
          stop: vi.fn(),
          onRunUpdated: vi.fn().mockReturnValue(() => {}),
          onRunOutput: vi.fn().mockReturnValue(() => {}),
        },
        space: {
          list: vi.fn().mockResolvedValue([space]),
          getById: vi.fn().mockResolvedValue(space),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          listAttempts: vi.fn().mockResolvedValue([attempt]),
          listAttemptsForSession: vi.fn().mockResolvedValue([]),
          linkAttempt: vi.fn(),
          updateAttempt: vi.fn(),
          unlinkAttempt: vi.fn(),
          setPrimaryAttempt: vi.fn(),
          listArtifacts: vi.fn().mockResolvedValue([]),
          addArtifact: vi.fn(),
          updateArtifact: vi.fn(),
          deleteArtifact: vi.fn(),
          listSources: vi.fn().mockResolvedValue([]),
          addSourcesFromPaths: vi.fn(),
          deleteSource: vi.fn(),
          showSourceOpenDialog: vi.fn(),
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
          ingestFromOpenDialog: vi.fn().mockResolvedValue({
            attachments: [],
            rejections: [],
          }),
          readBytes: vi.fn().mockResolvedValue(new Uint8Array()),
          delete: vi.fn().mockResolvedValue(undefined),
        },
        projectOpen: {
          listApps: vi.fn().mockResolvedValue([
            { id: 'vscode', label: 'VS Code', kind: 'editor' },
            { id: 'finder', label: 'Finder', kind: 'file-manager' },
          ]),
          open: vi.fn().mockResolvedValue(undefined),
        },
        executionHost: {
          // A daemon that cannot be reached, on purpose: the remote rows below
          // must come from the record alone (MAR-2694).
          getSessionWorkspace: vi
            .fn()
            .mockResolvedValue({ ok: false, message: 'daemon unreachable' }),
        },
      },
      configurable: true,
      writable: true,
    })
  })

  it('CH4 R5 More toggles the shared pin action, and a pinned conversation shows a mark beside its name — mutation the pin button still in the row turns red', async () => {
    const original = useSessionStore.getState().setPinned
    const setPinned = vi.fn().mockResolvedValue(undefined)
    useSessionStore.setState({ setPinned })
    try {
      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
      await act(async () => {})
      const header = document.querySelector<HTMLElement>(
        '[data-conversation-header]',
      )!
      // No pin button in the row, pinned or not.
      expect(
        within(header).queryByRole('button', { name: /pin/i }),
      ).not.toBeInTheDocument()
      expect(header.querySelector('[data-header-pin-mark]')).toBeNull()
      openGroup('Session actions')
      const pin = await screen.findByRole('menuitemcheckbox', {
        name: 'Pin conversation',
      })
      expect(pin).toHaveAttribute('aria-checked', 'false')
      fireEvent.click(pin)
      expect(setPinned).toHaveBeenCalledWith('session-1', true)
      act(() =>
        useSessionStore.setState((state) => ({
          sessions: state.sessions.map((s) => ({
            ...s,
            pinnedAt: '2026-09-12',
          })),
        })),
      )
      expect(
        within(header).getByRole('img', { name: 'Pinned' }),
      ).toBeInTheDocument()
      expect(
        within(header).queryByRole('button', { name: /pin/i }),
      ).not.toBeInTheDocument()
      openGroup('Session actions')
      fireEvent.click(
        await screen.findByRole('menuitemcheckbox', {
          name: 'Unpin conversation',
        }),
      )
      expect(setPinned).toHaveBeenLastCalledWith('session-1', false)
    } finally {
      useSessionStore.setState({ setPinned: original })
    }
  })

  it.each([
    ['claude-code', 'daemon-a'],
    ['codex', 'local'],
    ['pi', 'local'],
  ])(
    'R10 no harness promise for %s on %s — mutation remove provider or host gate turns red',
    async (providerId, executionHost) => {
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) => ({
          ...session,
          providerId,
          executionHost,
        })),
      }))
      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
      await act(async () => {})
      expect(screen.queryByTestId('harness-alert')).toBeNull()
      openGroup('Details')
      await screen.findByRole('region', { name: 'Session' })
      expect(
        screen.queryByRole('region', { name: 'Harness history' }),
      ).toBeNull()
    },
  )

  it('RUN61 reads the shared projection into the header and transcript — mutation omit harness view or compactions prop turns red', async () => {
    vi.mocked(window.electronAPI.session.harnessFacts).mockResolvedValue({
      turns: [],
      currentTurn: null,
      init: null,
      rateLimit: null,
      compactions: [
        {
          kind: 'harness.compaction',
          sequence: 1,
          at: '2026-01-01T00:00:00Z',
          trigger: 'auto',
          preTokens: 84000,
          postTokens: 12000,
          durationMs: null,
        },
      ],
    })
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    await waitFor(() =>
      expect(screen.queryByTestId('compaction-marker')?.textContent).toBe(
        'Compacted (auto) · 84k → 12k tokens',
      ),
    )
    // No alert, no chip in the row: the harness history is in Details (CH4
    // R3).
    expect(screen.queryByTestId('harness-alert')).toBeNull()
    openGroup('Details')
    const harness = await screen.findByRole('region', {
      name: 'Harness history',
    })
    expect(
      within(harness).getByRole('region', { name: 'Compactions' }),
    ).toHaveTextContent('Compacted (auto) · 84k → 12k tokens')
  })

  describe('MAR-3206 R8 — Details reaches the running process', () => {
    const figmaFacts = {
      turns: [],
      currentTurn: null,
      compactions: [],
      rateLimit: null,
      init: {
        kind: 'harness.init' as const,
        at: 'start',
        claudeCodeVersion: null,
        model: null,
        permissionMode: null,
        mcpServers: null,
        plugins: null,
        capabilities: null,
        tools: null,
        skills: null,
        slashCommands: null,
      },
      mcpStatus: {
        kind: 'harness.mcpStatus' as const,
        at: 'later',
        servers: [
          {
            name: 'claude.ai Figma',
            status: 'needs-auth',
            scope: 'claudeai',
            origin: 'https://mcp.figma.com',
          },
        ],
        connected: 0,
        omitted: 0,
        omittedAlerts: 0,
        pluginServers: [],
      },
    }
    const refresh = () =>
      vi.mocked(window.electronAPI.session.refreshMcpServers)
    const running = (canReconnectMcpServers: boolean) =>
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) => ({
          ...session,
          canReconnectMcpServers,
        })),
      }))
    const renderDetails = async () => {
      vi.mocked(window.electronAPI.session.harnessFacts).mockResolvedValue(
        figmaFacts,
      )
      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
      await act(async () => {})
      openGroup('Details')
      return screen.findByRole('region', { name: 'Harness history' })
    }

    it.each([true, false])(
      'opening Details reads the status only when a process runs — mutation no refresh on open turns red (running=%s)',
      async (capable) => {
        running(capable)
        await renderDetails()
        await act(async () => {})
        expect(refresh().mock.calls).toEqual(
          capable ? [['session-1', null]] : [],
        )
      },
    )

    it('pressing Reconnect calls the running session with the server’s name — mutation drop the mcp prop turns red', async () => {
      running(true)
      const harness = await renderDetails()
      refresh().mockClear()
      fireEvent.click(
        await within(harness).findByRole('button', {
          name: 'Reconnect claude.ai Figma',
        }),
      )
      await act(async () => {})
      expect(refresh().mock.calls).toEqual([['session-1', 'claude.ai Figma']])
    })

    it('press in A, switch to B, press in B, A settles → B stays pending — mutation settle without the id guard turns red', async () => {
      useSessionStore.setState((state) => ({
        sessions: [
          ...state.sessions,
          { ...state.sessions[0], id: 'session-2', name: 'Other session' },
        ],
      }))
      running(true)
      const settles: Array<() => void> = []
      const harness = await renderDetails()
      refresh().mockImplementation(
        (_id, reconnect) =>
          new Promise<void>((resolve) => {
            if (reconnect) settles.push(resolve)
            else resolve()
          }),
      )
      fireEvent.click(
        await within(harness).findByRole('button', {
          name: 'Reconnect claude.ai Figma',
        }),
      )
      await act(async () => {
        useSessionStore.setState({
          activeSessionId: 'session-2',
          activeConversationSessionId: 'session-2',
        })
      })
      const other = await screen.findByRole('region', {
        name: 'Harness history',
      })
      fireEvent.click(
        await within(other).findByRole('button', {
          name: 'Reconnect claude.ai Figma',
        }),
      )
      await act(async () => settles[0]())
      expect({
        calls: refresh()
          .mock.calls.filter(([, reconnect]) => reconnect !== null)
          .map(([id]) => id),
        label: within(
          screen.getByRole('region', { name: 'Harness history' }),
        ).getByRole('button', { name: 'Reconnect claude.ai Figma' })
          .textContent,
      }).toEqual({
        calls: ['session-1', 'session-2'],
        label: 'Reconnecting…',
      })
    })
  })

  it('R8 M2 failed evidence read keeps child work moved and exposes Retry in the conversation — mutation settle on error turns red', async () => {
    vi.mocked(window.electronAPI.session.listAgentRuns).mockRejectedValueOnce(
      new Error('offline'),
    )
    useSessionStore.setState({
      activeConversation: [
        {
          id: 'main',
          sessionId: 'session-1',
          sequence: 1,
          kind: 'message',
          actor: 'assistant',
          text: 'main immediately',
          state: 'complete',
          providerMeta: {},
          createdAt: 'now',
        },
        {
          id: 'child',
          sessionId: 'session-1',
          sequence: 2,
          kind: 'message',
          actor: 'assistant',
          text: 'child hidden',
          state: 'complete',
          agentRunId: 'orphan',
          agentAttribution: { description: 'child', agentType: 'Explore' },
          providerMeta: {},
          createdAt: 'now',
        },
      ] as import('@/entities/session').ConversationItem[],
    })
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeNull(),
    )
    const failed = {
      main: !!screen.queryByText('main immediately'),
      child: !!screen.queryByText('child hidden'),
      error: !!screen.queryByText('Parallel work could not be read ·'),
    }
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(screen.queryByText('child hidden')).not.toBeNull(),
    )
    expect({
      failed,
      errorAfterRetry: !!screen.queryByText(
        'Parallel work could not be read ·',
      ),
      reads: vi.mocked(window.electronAPI.session.listAgentRuns).mock.calls
        .length,
    }).toEqual({
      failed: { main: true, child: false, error: true },
      errorAfterRetry: false,
      reads: 2,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('CH1 R4 names the running code session Stop button', () => {
    useSessionStore.setState((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? { ...session, status: 'running' }
          : session,
      ),
    }))
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    const name = useSessionStore
      .getState()
      .sessions.find((session) => session.id === 'session-1')!.name
    const stop = screen.getByRole('button', { name: /^Stop / })
    expect(stop).toHaveAttribute('aria-label', `Stop ${name}`)
    expect(stop).toHaveAttribute('title', `Stop ${name}`)
  })

  it('MAR-3288 R5 says Compacting context… and never Finished while compacting — mutation drop the activity prop turns red', () => {
    useSessionStore.setState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? {
              ...session,
              status: 'completed',
              attention: 'finished',
              activity: 'compacting',
            }
          : session,
      ),
    }))
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    expect(screen.getByText('Compacting context…')).toBeInTheDocument()
    expect(screen.queryByText('Finished')).not.toBeInTheDocument()
  })

  it.each(['sealing', 'compacting', 'resuming'] as const)(
    'MAR-3288 R8 names the drill beat %s in ONE activity pill — mutation ignore the beat turns red',
    (beat) => {
      useSessionStore.setState((state) => ({
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === 'session-1'
            ? {
                ...session,
                status: beat === 'compacting' ? 'completed' : 'running',
                activity: beat === 'compacting' ? 'compacting' : null,
              }
            : session,
        ),
      }))
      useContextDrillStore.setState({ beats: { 'session-1': beat } })
      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
      const pills = screen.getAllByTestId('session-activity-indicator')
      expect(pills).toHaveLength(1)
      expect(pills[0]).toHaveTextContent(`drill · ${beat}`)
      expect(screen.queryByText('compacting context…')).not.toBeInTheDocument()
      useContextDrillStore.setState({ beats: {} })
    },
  )

  it('MAR-3325 hands the composer one context object while the open conversation streams and its summary moves — mutation write the context inline turns red', () => {
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    const first = composerContexts.at(-1)
    expect(first).toEqual({
      kind: 'project',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      activeSessionId: 'session-1',
    })
    composerContexts.length = 0

    for (let i = 1; i <= 15; i += 1) {
      act(() => {
        useSessionStore.setState((state) => ({
          activeConversation: [...state.activeConversation],
        }))
      })
      act(() => {
        useSessionStore.setState((state) => ({
          sessions: state.sessions.map((entry) => ({
            ...entry,
            status: i % 2 ? 'running' : 'completed',
            updatedAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
          })),
        }))
      })
    }

    // The view did redraw for each — the context it handed over did not move.
    expect(composerContexts.length).toBeGreaterThanOrEqual(30)
    expect(new Set(composerContexts)).toEqual(new Set([first]))
  })

  it('shows the live session activity in the header', async () => {
    useSessionStore.setState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? { ...session, status: 'running', activity: 'thinking' }
          : session,
      ),
    }))

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    expect(screen.getByTestId('session-activity-indicator')).toHaveTextContent(
      'thinking…',
    )
  })

  it('MAR-3288 lap 2 A says compacting exactly ONCE in the header during a plain compaction — mutation always render the grey pill turns red', () => {
    useSessionStore.setState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? {
              ...session,
              status: 'completed',
              attention: 'finished',
              activity: 'compacting',
            }
          : session,
      ),
    }))
    useContextDrillStore.setState({ beats: {} })
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    expect(screen.getAllByText(/compacting context…/i)).toHaveLength(1)
    expect(screen.getByText('Compacting context…')).toBeInTheDocument()
    expect(
      screen.queryByTestId('session-activity-indicator'),
    ).not.toBeInTheDocument()
  })

  it('MAR-3288 lap 2 A keeps drill · compacting beside the attention pill — it names the stage', () => {
    useSessionStore.setState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? {
              ...session,
              status: 'completed',
              attention: 'finished',
              activity: 'compacting',
            }
          : session,
      ),
    }))
    useContextDrillStore.setState({ beats: { 'session-1': 'compacting' } })
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    expect(screen.getByText('Compacting context…')).toBeInTheDocument()
    expect(screen.getByTestId('session-activity-indicator')).toHaveTextContent(
      'drill · compacting',
    )
    useContextDrillStore.setState({ beats: {} })
  })

  /**
   * Observed in the real header rather than on the container in isolation.
   * Removing the chip from `SessionView` breaks nothing and errors nowhere --
   * the feature is simply gone, and only somebody who remembers it existed
   * would ever notice. That silent absence is what this pins.
   */
  /**
   * Session details is the strip's own drawer, and nothing that names where a
   * session runs may lie (MAR-2619, MAR-2718).
   *
   * On a remote session the panel used to print the LOCAL checkout's branch and
   * the LOCAL worktree's pull request underneath the daemon's rows: `Branch —
   * master` for a session running on another machine, and `Pull request — No
   * workspace` two rows beneath a daemon-reported workspace. Both described a
   * checkout the session never touched.
   *
   * Mutation: drop the remote branch from `resolveRemoteSessionDetails` (or
   * render the local rows unconditionally again) and this goes red.
   */
  it.each([
    { branchName: 'agent/34372e47', expectedBranch: 'agent/34372e47' },
    { branchName: null, expectedBranch: 'daemon-named' },
  ])(
    'CH1 D shows Remote branch with $expectedBranch, never the local branch',
    async ({ branchName, expectedBranch }) => {
      useSessionStore.setState((state) => ({
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === 'session-1'
            ? {
                ...session,
                executionHost: 'daemon-a',
                workAddress: {
                  mode: 'repository' as const,
                  repository: 'https://github.com/marckraw/convergence.git',
                  branchName: null,
                  label: 'marckraw/convergence',
                },
                reportedWorkspace: branchName
                  ? {
                      mode: 'repository' as const,
                      repository: 'https://github.com/marckraw/convergence.git',
                      branchName,
                      baseRef: 'master',
                      workspacePath: '/srv/worktrees/s-1',
                      environment: null,
                    }
                  : null,
              }
            : session,
        ),
      }))

      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Details' }))

      const panel = await screen.findByText('Works in')
      const rows = panel.closest('div')?.parentElement
      expect(rows).toBeTruthy()
      expect(rows?.textContent).toContain(expectedBranch)
      expect(screen.getByText('Remote branch')).toBeInTheDocument()
      // The two local rows, gone: this session runs on another machine and has
      // no worktree here to have a branch or a pull request on.
      expect(rows?.textContent).not.toContain('No workspace')
      expect(rows?.textContent).not.toContain('master')
      // The branch stays recorded; the PR row reports the Mac lookup's failure.
      await waitFor(() =>
        expect(rows?.textContent).toContain('PR unknown — gh not found'),
      )
      expect(rows?.textContent).not.toContain('None yet')
    },
  )

  // The refresh is the gh-backed session lookup; the daemon snapshot is a hint.
  it('checks the PR when Session details opens (mutation: omit details refresh)', async () => {
    vi.mocked(window.electronAPI.pullRequest.refreshForSession).mockReturnValue(
      new Promise(() => {}),
    )
    // A fetch that never settles: the panel must render the honest interim
    // state rather than a negative answer nobody gave.
    ;(
      window as unknown as {
        electronAPI: { executionHost: { getSessionWorkspace: unknown } }
      }
    ).electronAPI.executionHost.getSessionWorkspace = vi
      .fn()
      .mockReturnValue(new Promise(() => {}))

    useSessionStore.setState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? {
              ...session,
              executionHost: 'daemon-a',
              workAddress: {
                mode: 'repository' as const,
                repository: 'https://github.com/marckraw/convergence.git',
                branchName: null,
                label: 'marckraw/convergence',
              },
              reportedWorkspace: {
                mode: 'repository' as const,
                repository: 'https://github.com/marckraw/convergence.git',
                branchName: 'agent/34372e47',
                baseRef: 'master',
                workspacePath: '/srv/worktrees/s-1',
                environment: null,
              },
            }
          : session,
      ),
    }))

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Details' }))

    const panel = await screen.findByText('Works in')
    const rows = panel.closest('div')?.parentElement
    expect(rows?.textContent).toContain('PR checking…')
    expect(
      window.electronAPI.pullRequest.refreshForSession,
    ).toHaveBeenCalledExactlyOnceWith('session-1')
    expect(rows?.textContent).not.toContain('None yet')
  })

  it('reports the gh failure beside the workspace the daemon did send', async () => {
    ;(
      window as unknown as {
        electronAPI: { executionHost: { getSessionWorkspace: unknown } }
      }
    ).electronAPI.executionHost.getSessionWorkspace = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        info: {
          workspace: {
            mode: 'repository',
            repository: 'https://github.com/marckraw/convergence.git',
            branchName: 'agent/34372e47',
            baseRef: 'master',
            workspacePath: '/srv/worktrees/s-1',
            environment: null,
          },
        },
      })

    useSessionStore.setState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? {
              ...session,
              executionHost: 'daemon-a',
              workAddress: {
                mode: 'repository' as const,
                repository: 'https://github.com/marckraw/convergence.git',
                branchName: null,
                label: 'marckraw/convergence',
              },
              reportedWorkspace: null,
            }
          : session,
      ),
    }))

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Details' }))

    const panel = await screen.findByText('Works in')
    const rows = panel.closest('div')?.parentElement
    await waitFor(() =>
      expect(rows?.textContent).toContain('PR unknown — gh not found'),
    )
    expect(rows?.textContent).not.toContain('None yet')
    // The workspace half of the same answer survives it.
    expect(rows?.textContent).toContain('agent/34372e47')
  })

  it('shows a remote session with no workspace its own verified PR fact', async () => {
    const fact = {
      number: 545,
      url: 'https://github.com/marckraw/convergence/pull/545',
      state: 'open' as const,
      headBranch: 'agent/34372e47',
      checkedAt: '2026-09-12',
      source: 'gh' as const,
    }
    vi.mocked(window.electronAPI.pullRequest.getForSession).mockResolvedValue({
      pullRequest: fact,
      branchName: fact.headBranch,
      message: null,
    })
    vi.mocked(
      window.electronAPI.pullRequest.refreshForSession,
    ).mockResolvedValue({
      pullRequest: fact,
      branchName: fact.headBranch,
      message: null,
    })
    useSessionStore.setState((state) => ({
      sessions: state.sessions.map((session) => ({
        ...session,
        pullRequest: fact,
      })),
    }))
    ;(
      window as unknown as {
        electronAPI: { executionHost: { getSessionWorkspace: unknown } }
      }
    ).electronAPI.executionHost.getSessionWorkspace = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        info: { workspace: null },
      })

    useSessionStore.setState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? {
              ...session,
              executionHost: 'daemon-a',
              workAddress: {
                mode: 'repository' as const,
                repository: 'https://github.com/marckraw/convergence.git',
                branchName: null,
                label: 'marckraw/convergence',
              },
              reportedWorkspace: null,
            }
          : session,
      ),
    }))

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Details' }))

    const panel = await screen.findByText('Works in')
    const rows = panel.closest('div')?.parentElement
    await waitFor(() => expect(rows?.textContent).toContain('#545 · open'))
    expect(rows?.textContent).not.toContain('None yet')
  })

  /**
   * The other half, unchanged: a local session still reads its own checkout.
   *
   * Mutation: treat every session as remote in the container and this goes red.
   */
  it('leaves a local session showing its own branch and pull request', async () => {
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Details' }))

    const branchRow = await screen.findByText('Checkout branch')
    const rows = branchRow.closest('div')?.parentElement
    expect(rows?.textContent).toContain('master')
    expect(rows?.textContent).toContain('Pull request')
    expect(rows?.textContent).not.toContain('Works in')
  })

  it('a newly broadcast PR fact replaces an earlier no-PR reading (mutation: prefer cached message)', async () => {
    const absent = {
      pullRequest: null,
      branchName: 'agent/old',
      message: 'No PR for this branch',
    }
    vi.mocked(window.electronAPI.pullRequest.getForSession).mockResolvedValue(
      absent,
    )
    vi.mocked(
      window.electronAPI.pullRequest.refreshForSession,
    ).mockResolvedValue(absent)
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    openGroup('Project')
    fireEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: /^Pull request/ }),
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Details' }))
    await waitFor(() =>
      expect(
        screen.getAllByText('No PR for this branch').length,
      ).toBeGreaterThan(0),
    )
    act(() =>
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) => ({
          ...session,
          pullRequest: {
            number: 42,
            url: 'https://github.com/acme/app/pull/42',
            state: 'open' as const,
            headBranch: 'agent/fresh',
            checkedAt: '2026-09-12',
            source: 'gh' as const,
          },
        })),
      })),
    )
    expect(screen.queryAllByText('No PR for this branch')).toHaveLength(0)
    expect(screen.getAllByText('#42 · open').length).toBeGreaterThan(0)
    expect(screen.getByText('agent/fresh')).toBeInTheDocument()
  })

  it('shows a lookup error beside the last verified fact (mutation: suppress errors when a fact exists)', async () => {
    const fact = {
      number: 42,
      url: 'https://github.com/acme/app/pull/42',
      state: 'open' as const,
      headBranch: 'agent/horse',
      checkedAt: '2026-09-12',
      source: 'gh' as const,
    }
    useSessionStore.setState((state) => ({
      sessions: state.sessions.map((session) => ({
        ...session,
        pullRequest: fact,
      })),
    }))
    const reading = {
      pullRequest: fact,
      branchName: fact.headBranch,
      message: 'PR unknown — gh not found',
    }
    vi.mocked(window.electronAPI.pullRequest.getForSession).mockResolvedValue(
      reading,
    )
    vi.mocked(
      window.electronAPI.pullRequest.refreshForSession,
    ).mockResolvedValue(reading)
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    openGroup('Project')
    fireEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: /^Pull request/ }),
    )
    await screen.findByText('PR unknown — gh not found')
    expect(screen.getByText('#42 · open')).toBeInTheDocument()
  })

  it('opening Session actions does not refresh the PR (mutation: refresh on every menu)', async () => {
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Session actions' }),
    )
    await screen.findByText('Fork session…')
    expect(
      window.electronAPI.pullRequest.refreshForSession,
    ).not.toHaveBeenCalled()
  })

  it('CH4 R6 the wires leave the header; the composer still shows them — mutation keep the header pill turns red', async () => {
    useSessionStore.setState((state) => ({
      ...state,
      globalSessions: [
        ...state.sessions,
        {
          ...state.sessions[0],
          id: 'session-2',
          name: 'Reviewer',
        },
      ],
    }))
    useSessionRelayStore.setState({
      relays: [
        {
          id: 'relay-1',
          crewId: 'crew-1',
          sourceSessionId: 'session-1',
          trigger: 'settled',
          action: 'hail',
          targetSessionId: 'session-2',
          spawnSpec: null,
          instruction: null,
          opener: null,
          conditionToken: null,
          armed: true,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      isLoaded: true,
    })

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    const name = '1 wire fires when this session finishes.'
    const header = document.querySelector<HTMLElement>(
      '[data-conversation-header]',
    )!
    expect(within(header).queryByRole('button', { name })).toBeNull()
    expect(within(header).queryByText('1 wire')).toBeNull()
    const composer = screen.getByTestId('composer')
    expect(within(composer).getByRole('button', { name })).toHaveTextContent(
      '1 wire',
    )
  })

  it('opens the session workspace from the header menu', async () => {
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    // Let the app list land so Open in… lists them.
    await act(async () => {
      await Promise.resolve()
    })
    openGroup('Project')
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Open in VS Code' }),
    )

    const projectOpen = (
      window as unknown as {
        electronAPI: {
          projectOpen: { open: ReturnType<typeof vi.fn> }
        }
      }
    ).electronAPI.projectOpen

    await waitFor(() => {
      expect(projectOpen.open).toHaveBeenCalledWith({
        appId: 'vscode',
        path: '/tmp/project',
      })
    })
  })

  it('runs the project actions from the session working directory, one activation after Project opens', async () => {
    const script = {
      id: 'script-1',
      projectId: 'project-1',
      name: 'Dev',
      command: 'npm run dev',
      icon: 'play' as const,
      cwd: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const run = {
      id: 'run-1',
      scriptId: script.id,
      projectId: 'project-1',
      command: script.command,
      cwd: '/tmp/project/.worktrees/yolo-mode',
      status: 'queued' as const,
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: null,
      exitCode: null,
      signal: null,
      errorMessage: null,
      stdout: '',
      stderr: '',
    }
    vi.mocked(window.electronAPI.projectScripts.list).mockResolvedValue([
      script,
    ])
    vi.mocked(window.electronAPI.projectScripts.run).mockResolvedValue(run)
    useSessionStore.setState((state) => ({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === 'session-1'
          ? {
              ...session,
              workingDirectory: '/tmp/project/.worktrees/yolo-mode',
            }
          : session,
      ),
    }))

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    openGroup('Project')
    fireEvent.click(await screen.findByTitle('Run Dev'))

    await waitFor(() => {
      expect(window.electronAPI.projectScripts.run).toHaveBeenCalledWith(
        'script-1',
        { cwd: '/tmp/project/.worktrees/yolo-mode' },
      )
    })
  })

  it('uses the active project name as the new session composer title', () => {
    useProjectStore.setState((state) => ({
      ...state,
      activeProject: state.activeProject
        ? { ...state.activeProject, name: 'Roomfinder' }
        : null,
    }))
    useSessionStore.setState((state) => ({
      ...state,
      sessions: [],
      activeSessionId: null,
      activeConversation: [],
      activeConversationSessionId: null,
    }))

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    expect(screen.getByText('Roomfinder')).toBeInTheDocument()
    expect(screen.queryByText('Convergence')).not.toBeInTheDocument()
  })

  it('does not expose actions for stale approval cards on inactive sessions — treating completed legacy cards as pending turns red', () => {
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

  describe('MAR-3377 R2 a status update reloads nothing', () => {
    const noteAttachment = {
      id: 'att-1',
      sessionId: 'session-1',
      kind: 'text' as const,
      mimeType: 'text/plain',
      filename: 'notes.txt',
      sizeBytes: 12,
      storagePath: '/tmp/att-1',
      thumbnailPath: null,
      textPreview: 'hello',
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    function userMessage(attachmentIds: string[]) {
      return {
        id: 'user-message-1',
        sessionId: 'session-1',
        sequence: 1,
        turnId: 'turn-1',
        kind: 'message' as const,
        actor: 'user' as const,
        text: 'look at this',
        attachmentIds,
        state: 'complete' as const,
        createdAt: '2026-01-01T00:00:01.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
        providerMeta: {
          providerId: 'claude-code',
          providerItemId: null,
          providerEventType: 'user',
        },
      }
    }

    function withSpaceSpies(
      run: (spies: {
        loadSpaces: ReturnType<typeof vi.fn>
        loadAttemptsForSession: ReturnType<typeof vi.fn>
      }) => Promise<void>,
    ) {
      const original = useSpaceStore.getState()
      const loadSpaces = vi.fn().mockResolvedValue(undefined)
      const loadAttemptsForSession = vi.fn().mockResolvedValue(undefined)
      useSpaceStore.setState({ loadSpaces, loadAttemptsForSession })
      return run({ loadSpaces, loadAttemptsForSession }).finally(() =>
        useSpaceStore.setState({
          loadSpaces: original.loadSpaces,
          loadAttemptsForSession: original.loadAttemptsForSession,
        }),
      )
    }

    it('10 summaries of the open conversation call nothing; switching calls each once — mutation key the effects on the session object turns red', () =>
      withSpaceSpies(async ({ loadSpaces, loadAttemptsForSession }) => {
        const getForSession = vi.mocked(
          window.electronAPI.attachments.getForSession,
        )
        render(
          <TooltipProvider>
            <SessionView />
          </TooltipProvider>,
        )
        await act(async () => {})
        expect(loadSpaces).toHaveBeenCalledTimes(1)
        expect(loadAttemptsForSession).toHaveBeenCalledWith('session-1')
        expect(getForSession).toHaveBeenCalledWith('session-1')
        loadSpaces.mockClear()
        loadAttemptsForSession.mockClear()
        getForSession.mockClear()

        // What `handleSessionSummaryUpdate` leaves for this view: a new
        // summary object for the same conversation, status and clock moved.
        for (let i = 1; i <= 10; i += 1) {
          await act(async () => {
            useSessionStore.setState((state) => ({
              sessions: state.sessions.map((entry) => ({
                ...entry,
                status: i % 2 ? 'running' : 'completed',
                activity: i % 2 ? 'streaming' : null,
                updatedAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
              })),
            }))
          })
        }

        expect(loadSpaces).not.toHaveBeenCalled()
        expect(loadAttemptsForSession).not.toHaveBeenCalled()
        expect(getForSession).not.toHaveBeenCalled()

        await act(async () => {
          useSessionStore.setState((state) => ({
            sessions: [
              ...state.sessions,
              { ...state.sessions[0]!, id: 'session-2', name: 'Other' },
            ],
            activeSessionId: 'session-2',
            activeConversationSessionId: 'session-2',
          }))
        })

        expect(loadSpaces).toHaveBeenCalledTimes(1)
        expect(loadAttemptsForSession).toHaveBeenCalledTimes(1)
        expect(loadAttemptsForSession).toHaveBeenCalledWith('session-2')
        expect(getForSession).toHaveBeenCalledTimes(1)
        expect(getForSession).toHaveBeenCalledWith('session-2')
      }))

    it('a new message referencing an attachment ingested under a draft key renders its chip — mutation drop the referenced-attachments trigger turns red', async () => {
      const getForSession = vi.mocked(
        window.electronAPI.attachments.getForSession,
      )
      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
      await act(async () => {})
      expect(getForSession).toHaveBeenCalledTimes(1)

      // The first message of a new session: the backend rebound the draft's
      // attachment to this session, and the renderer has not read it yet.
      getForSession.mockResolvedValue([noteAttachment])
      await act(async () => {
        useSessionStore.setState({
          activeConversation: [userMessage(['att-1'])],
        })
      })

      expect(await screen.findByTestId('attachment-chip')).toHaveTextContent(
        'notes.txt',
      )
      expect(getForSession).toHaveBeenCalledTimes(2)
    })
  })

  it('opens the Space link dialog from session actions', async () => {
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /session actions/i }),
    )
    fireEvent.click(await screen.findByText('Link to Space...'))

    expect(useDialogStore.getState().openDialog).toBe('space-session-link')
    expect(useDialogStore.getState().payload).toEqual({
      sessionId: 'session-1',
    })
  })

  it('does not render the Space context panel for an unlinked session', () => {
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    expect(screen.queryByTestId('space-context-panel')).toBeNull()
  })

  it('renders Space context for a linked session and opens the Workboard', async () => {
    vi.mocked(
      window.electronAPI.space.listAttemptsForSession,
    ).mockResolvedValue([attempt])
    useSpaceStore.setState({
      spaces: [space],
      attemptsBySpaceId: { 'space-1': [attempt] },
      attemptsBySessionId: { 'session-1': [attempt] },
      artifactsBySpaceId: {},
      sourcesBySpaceId: {},
      loading: false,
      error: null,
    })

    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    expect(screen.getByTestId('space-context-panel')).toBeInTheDocument()
    expect(screen.getByText('Agent-native spaces')).toBeInTheDocument()
    expect(
      screen.getByText('Keep the session and Space visible together.'),
    ).toBeInTheDocument()
    expect(screen.getByText('feat/space-panel')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: /open space agent-native spaces/i,
      }),
    )

    expect(useDialogStore.getState().openDialog).toBe('space-workboard')
    expect(useDialogStore.getState().payload).toEqual({
      spaceId: 'space-1',
    })
  })

  it('L8 two navigation clicks in one millisecond both reach the transcript — mutation Date.now nonce turns red', async () => {
    sessionRowWidth(1700)
    vi.spyOn(Date, 'now').mockReturnValue(17)
    vi.mocked(window.electronAPI.session.listAgentRuns).mockResolvedValue([
      {
        id: 'agent',
        sessionId: 'session-1',
        spawnedByItemId: 'spawn',
        description: 'Inspect routing',
        agentType: 'Explore',
        status: 'completed',
      } as SessionAgentRun,
    ])
    useSessionStore.setState({
      activeConversation: [
        {
          id: 'spawn',
          sessionId: 'session-1',
          sequence: 1,
          turnId: null,
          kind: 'tool-call',
          state: 'complete',
          toolName: 'Agent',
          inputText: '{}',
          createdAt: 'now',
          updatedAt: 'now',
          providerMeta: {
            providerId: 'claude-code',
            providerItemId: 'tool',
            providerEventType: 'tool',
          },
        },
      ],
    })
    runParallel()
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Parallel work · 1' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: '1 older · time not reported',
      }),
    )
    const spawn = await screen.findByRole('button', { name: 'View spawn' })
    navigationScroll.mockClear()
    fireEvent.click(spawn)
    fireEvent.click(spawn)
    expect(
      navigationScroll.mock.calls.filter(
        ([, options]) => options?.align === 'center',
      ),
    ).toHaveLength(2)
    vi.restoreAllMocks()
  })

  it('T10 closing parallel work returns focus to its invoking control — mutation omit focus return turns red', async () => {
    sessionRowWidth(1700)
    runParallel()
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    const opener = screen.getByRole('button', { name: 'Parallel work · 1' })
    opener.focus()
    fireEvent.click(opener)
    const close = await screen.findByRole('button', {
      name: 'Close parallel work',
    })
    close.focus()
    fireEvent.click(close)
    expect(document.activeElement).toBe(opener)
  })

  it('CH2 R3 Escape in the overlay closes it and returns focus to its invoking control — mutation drop onReturnFocus turns red', async () => {
    sessionRowWidth(900)
    runParallel()
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    const opener = screen.getByRole('button', { name: 'Parallel work · 1' })
    opener.focus()
    fireEvent.click(opener)
    const overlay = await screen.findByRole('dialog', {
      name: 'Parallel work',
    })
    await act(async () => fireEvent.keyDown(overlay, { key: 'Escape' }))
    // The dialog's focus trap lets go on a later task; wait for it rather
    // than guess which one.
    await waitFor(() => expect(document.activeElement).toBe(opener))
    expect(screen.queryByRole('dialog', { name: 'Parallel work' })).toBeNull()
  })

  // The session view, not the panel, knows what else is docked in its row.
  // At 1,300 px Parallel work fits alone (1300 − 420 = 880 ≥ 720) but not
  // beside a 320 px side panel (560), so each side panel must tip it over.
  const dockedParallel = () =>
    screen.queryByRole('button', { name: 'Close parallel work' }) !== null &&
    screen.queryByRole('dialog', { name: 'Parallel work' }) === null
  const overlayParallel = () =>
    screen.queryByRole('dialog', { name: 'Parallel work' }) !== null

  it('CH2 lap 2 A opening the PR panel turns docked Parallel work into the overlay, closing it docks again — mutation drop the PR term turns red', async () => {
    sessionRowWidth(1300)
    runParallel()
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Parallel work · 1' }))
    await waitFor(() => expect(dockedParallel()).toBe(true))

    openGroup('Project')
    fireEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: /^Pull request/ }),
    )
    await waitFor(() => expect(overlayParallel()).toBe(true))

    // The modal overlay hides the rest of the row from the accessibility
    // tree; the wiring under test is the width the view hands the panel, so
    // close the PR panel by its own control regardless.
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Close pull request panel',
        hidden: true,
      }),
    )
    await waitFor(() => expect(dockedParallel()).toBe(true))
  })

  it('CH2 lap 2 A linking a Space turns docked Parallel work into the overlay, unlinking docks again — mutation drop the Space term turns red', async () => {
    sessionRowWidth(1300)
    useSpaceStore.setState({ spaces: [space] })
    runParallel()
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    // Let the mount's own attempts read land before the test links anything.
    await waitFor(() =>
      expect(
        window.electronAPI.space.listAttemptsForSession,
      ).toHaveBeenCalled(),
    )
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Parallel work · 1' }))
    await waitFor(() => expect(dockedParallel()).toBe(true))

    act(() =>
      useSpaceStore.setState({
        attemptsBySpaceId: { 'space-1': [attempt] },
        attemptsBySessionId: { 'session-1': [attempt] },
      }),
    )
    expect(screen.getByTestId('space-context-panel')).toBeInTheDocument()
    await waitFor(() => expect(overlayParallel()).toBe(true))

    act(() =>
      useSpaceStore.setState({
        attemptsBySpaceId: {},
        attemptsBySessionId: {},
      }),
    )
    expect(screen.queryByTestId('space-context-panel')).toBeNull()
    await waitFor(() => expect(dockedParallel()).toBe(true))
  })

  it('CH2 lap 2 B switching conversations with the overlay open leaves no stale dialog and no stolen focus — mutation return focus unconditionally turns red', async () => {
    sessionRowWidth(900)
    runParallel()
    const [first] = useSessionStore.getState().sessions
    useSessionStore.setState({
      sessions: [first, { ...first, id: 'session-2', name: 'Second session' }],
    })
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    const opener = screen.getByRole('button', { name: 'Parallel work · 1' })
    opener.focus()
    fireEvent.click(opener)
    const before = await screen.findByRole('dialog', { name: 'Parallel work' })
    await waitFor(() =>
      expect(before.contains(document.activeElement)).toBe(true),
    )

    // What a person would see: focus landing on the header button, even for
    // a moment, before the next conversation's trap pulls it back.
    const openerFocused = vi.fn()
    opener.addEventListener('focus', openerFocused)
    act(() =>
      useSessionStore.setState({
        activeSessionId: 'session-2',
        activeConversationSessionId: 'session-2',
        activeConversation: [],
      }),
    )
    // Radix runs an unmounted scope's close-focus on a setTimeout(0); give
    // every such task time to run before looking.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    // The panel stays open across a switch (it always has); only the old
    // conversation's dialog is gone.
    expect(before.isConnected).toBe(false)
    const dialogs = screen.getAllByRole('dialog', { name: 'Parallel work' })
    expect(dialogs).toHaveLength(1)
    const focused = document.activeElement
    expect(focused?.isConnected).toBe(true)
    expect(focused?.closest('[role="dialog"][data-state="closed"]')).toBeNull()
    expect(dialogs[0].contains(focused)).toBe(true)
    expect(openerFocused).not.toHaveBeenCalled()
  })

  describe('MAR-3427 CH3 the conversation header', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    const otherProject = {
      id: 'project-2',
      name: 'emergence',
      repositoryPath: '/tmp/emergence',
      settings: DEFAULT_PROJECT_SETTINGS,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      laneOf: null,
      laneName: null,
    }

    it('R1 names the session’s own project and the conversation, in title and accessible name — mutation use activeProject turns red', () => {
      // The sidebar has convergence selected; this conversation is emergence's.
      useProjectStore.setState((state) => ({
        projects: [state.activeProject!, otherProject],
      }))
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) => ({
          ...session,
          projectId: 'project-2',
        })),
      }))
      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
      const identity = screen.getByRole('group', {
        name: 'Test session, in emergence',
      })
      expect(identity).toHaveAttribute('title', 'emergence / Test session')
      expect(identity).toHaveTextContent('emergence')
      expect(identity).toHaveTextContent('Test session')
      expect(identity).not.toHaveTextContent('convergence')
    })

    it('R1 the project gives way before the conversation name: the name keeps its reserve', () => {
      useProjectStore.setState((state) => ({
        projects: [state.activeProject!],
      }))
      headerWidth(400)
      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
      const project = document.querySelector<HTMLElement>(
        '[data-header-project]',
      )!
      const name = document.querySelector<HTMLElement>('[data-header-name]')!
      expect(name.style.minWidth).toBe('120px')
      expect(project.style.minWidth).toBe('40px')
      // MAR-3427 B: the project is the one name that flex-shrinks; the
      // conversation name is capped at what the project's floor leaves.
      expect(project.style.flexShrink).toBe('1')
      expect(name.style.flexShrink).toBe('0')
      expect(name.style.maxWidth).toBe('calc(100% - 60px)')
    })

    it('R4 a narrow header moves the groups into More by name; Project, opened from there, still toggles the terminal — mutation drop yielded items turns red', async () => {
      const hydratePaneTree = vi.fn().mockResolvedValue(undefined)
      useTerminalStore.setState({ hydratePaneTree, treesBySessionId: {} })
      headerWidth(400)
      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
      // Yielded: out of the header's reach, still mounted.
      for (const name of ['View', 'Details', 'Project'])
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()

      fireEvent.pointerDown(
        screen.getByRole('button', { name: 'Session actions' }),
      )
      for (const name of ['View', 'Details'])
        expect(
          await screen.findByRole('menuitem', { name }),
        ).toBeInTheDocument()
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Project' }))
      fireEvent.click(
        await screen.findByRole('menuitem', { name: 'Open terminal' }),
      )
      expect(hydratePaneTree).toHaveBeenCalledWith({
        sessionId: 'session-1',
        cwd: '/tmp/project',
        cols: 80,
        rows: 24,
      })
    })

    it('R5 a narrow running header puts identity, Stop and More on row 1 and the status on row 2', () => {
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) => ({
          ...session,
          status: 'running' as const,
        })),
      }))
      headerWidth(400)
      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
      const header = document.querySelector('[data-conversation-header]')!
      expect(header).toHaveAttribute('data-header-rows', '2')
      const statusRow = header.querySelector('[data-header-status-row]')!
      expect(statusRow).toHaveTextContent('Running')
      expect(
        screen.getByRole('button', { name: 'Stop Test session' }),
      ).toBeInTheDocument()
    })

    const renderView = () =>
      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
    const more = () => screen.getByRole('button', { name: 'Session actions' })
    const openMore = () => fireEvent.pointerDown(more())
    const innerTrigger = (id: string) =>
      document
        .querySelector(`[data-header-inner="${id}"]`)!
        .querySelector('button')!
    const setSession = (patch: Record<string, unknown>) =>
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) => ({ ...session, ...patch })),
      }))

    it.each([
      ['View', 'view'],
      ['Details', 'details'],
      ['Project', 'project'],
    ] as const)(
      'E %s, yielded, opens its own menu from More through its controlled open — mutation drop onOpen turns red',
      async (name, id) => {
        headerWidth(400)
        renderView()
        await act(async () => {
          await Promise.resolve()
        })
        openMore()
        fireEvent.click(await screen.findByRole('menuitem', { name }))
        const trigger = innerTrigger(id)
        await waitFor(() =>
          expect(trigger).toHaveAttribute('aria-expanded', 'true'),
        )
        const opened = screen.getByRole('menu')
        expect(opened.id).toBe(trigger.getAttribute('aria-controls'))
      },
    )

    it('E a menu opened from More hands focus back to More when it closes — mutation the focus() removed turns red', async () => {
      headerWidth(400)
      renderView()
      openMore()
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Details' }))
      const trigger = innerTrigger('details')
      await waitFor(() =>
        expect(trigger).toHaveAttribute('aria-expanded', 'true'),
      )
      await act(async () =>
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' }),
      )
      await waitFor(() =>
        expect(trigger).toHaveAttribute('aria-expanded', 'false'),
      )
      await waitFor(() => expect(document.activeElement).toBe(more()))
    })

    /**
     * Menus as the app draws them (MAR-3427 A): they fade out, and Radix
     * keeps the closing content mounted -- with focus still inside -- until
     * the animation ends. jsdom runs no animation, so the content is given its
     * animation name here, and `finishExits` ends every fade.
     */
    function withExitAnimations() {
      const real = globalThis.getComputedStyle.bind(globalThis)
      vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(
        (element, pseudo) => {
          const style = real(element, pseudo)
          if (!element.matches('[role="menu"], [role="dialog"]')) return style
          return new Proxy(style, {
            get(target, key) {
              if (key === 'animationName')
                return element.getAttribute('data-state') === 'closed'
                  ? 'pop-out'
                  : 'pop-in'
              const value = Reflect.get(target, key, target)
              return typeof value === 'function' ? value.bind(target) : value
            },
          })
        },
      )
      if (typeof globalThis.CSS?.escape !== 'function')
        vi.stubGlobal('CSS', {
          ...globalThis.CSS,
          escape: (value: string) => value,
        })
    }
    const finishExits = () =>
      act(() => {
        for (const content of document.querySelectorAll(
          '[role="menu"][data-state="closed"], [role="dialog"][data-state="closed"]',
        )) {
          const end = new Event('animationend')
          Object.assign(end, { animationName: 'pop-out' })
          content.dispatchEvent(end)
        }
      })
    /** Opens a yielded menu from More, both fades played out. */
    const openFromMore = async (name: string, id: string) => {
      openMore()
      fireEvent.click(await screen.findByRole('menuitem', { name }))
      await finishExits()
      const trigger = innerTrigger(id)
      await waitFor(() =>
        expect(trigger).toHaveAttribute('aria-expanded', 'true'),
      )
      return {
        trigger,
        content: document.getElementById(
          trigger.getAttribute('aria-controls')!,
        )!,
      }
    }

    it.each([
      ['View', 'view'],
      ['Details', 'details'],
      ['Project', 'project'],
    ] as const)(
      'A %s, opened from More, hands focus back to More after its exit animation — mutation lap 2 one-task watcher turns red',
      async (name, id) => {
        withExitAnimations()
        headerWidth(400)
        renderView()
        await act(async () => {
          await Promise.resolve()
        })
        const { trigger, content } = await openFromMore(name, id)
        await waitFor(() =>
          expect(content.contains(document.activeElement)).toBe(true),
        )
        await act(async () => fireEvent.keyDown(content, { key: 'Escape' }))
        await waitFor(() =>
          expect(trigger).toHaveAttribute('aria-expanded', 'false'),
        )
        // The exit: closed, still mounted, focus still inside.
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
        })
        expect(content).toBeInTheDocument()
        expect(content.contains(document.activeElement)).toBe(true)

        await finishExits()
        await waitFor(() => expect(content).not.toBeInTheDocument())
        await waitFor(() => expect(document.activeElement).toBe(more()))
      },
    )

    it('A a left click outside a modal menu is not an interaction that keeps focus: More takes it, as Radix gives it to the trigger', async () => {
      withExitAnimations()
      headerWidth(400)
      renderView()
      const outside = document.createElement('p')
      document.body.append(outside)
      const { content } = await openFromMore('Details', 'details')
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      await act(async () => fireEvent.pointerDown(outside, { button: 0 }))
      await finishExits()
      await waitFor(() => expect(content).not.toBeInTheDocument())
      await waitFor(() => expect(document.activeElement).toBe(more()))
      outside.remove()
    })

    it('R9 a right-click outside a modal menu leaves focus where it is, not on More — mutation the menu branch returns false turns red', async () => {
      withExitAnimations()
      headerWidth(400)
      renderView()
      const outside = document.createElement('p')
      document.body.append(outside)
      const { content } = await openFromMore('Details', 'details')
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      await act(async () => fireEvent.pointerDown(outside, { button: 2 }))
      await finishExits()
      await waitFor(() => expect(content).not.toBeInTheDocument())
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
      expect(document.activeElement).not.toBe(more())
      expect(document.activeElement).toBe(document.body)
      outside.remove()
    })

    it('D a group that yields while More is open is listed by its own name — mutation read triggers only when More opens turns red', async () => {
      // 760 px, idle: the row asks 698 (identity 280, Finished 90, the three
      // groups at 90, More 28, five 6 px gaps) of 728 and every group is
      // drawn; a run's Stop asks 96 more, and Project yields.
      headerWidth(760)
      renderView()
      expect(innerTrigger('project').closest('[data-yielded]')).toBeNull()
      openMore()
      await screen.findByRole('menu')
      expect(screen.queryByRole('menuitem', { name: 'Project' })).toBeNull()
      act(() => setSession({ status: 'running' }))
      expect(innerTrigger('project').closest('[data-yielded]')).not.toBeNull()
      expect(
        await screen.findByRole('menuitem', { name: 'Project' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'project' })).toBeNull()
    })

    it('D a yielded trigger that changes on its own while More is open is read again — mutation drop the open-More observer turns red', async () => {
      headerWidth(400)
      renderView()
      await act(async () => {
        await Promise.resolve()
      })
      openMore()
      expect(
        await screen.findByRole('menuitem', { name: 'Project' }),
      ).toBeInTheDocument()
      // An action starts: only the Project trigger re-renders, not the
      // header, so only the observer can see its new name.
      act(() =>
        useProjectScriptStore.setState({
          scriptsByProjectId: { 'project-1': [devScript] },
          runsByProjectId: {
            'project-1': [{ ...devRun, status: 'running' as const }],
          },
        }),
      )
      expect(innerTrigger('project')).toHaveTextContent(
        'Project, an action is running',
      )
      await waitFor(() =>
        expect(
          screen.getByRole('menuitem', {
            name: 'Project, an action is running',
          }),
        ).toBeInTheDocument(),
      )
    })

    it('G a yielded group is inert and hidden; a drawn status item is neither — mutation removing inert turns red', () => {
      headerWidth(400)
      renderView()
      const yielded = document.querySelector('[data-header-item="project"]')!
      expect(yielded).toHaveAttribute('data-yielded')
      expect(yielded).toHaveAttribute('inert')
      expect(yielded).toHaveAttribute('aria-hidden', 'true')
      const drawn = document.querySelector('[data-header-item="attention"]')!
      expect(drawn).not.toHaveAttribute('inert')
    })

    it('H in two rows the status row drags by its empty space; only its controls are no-drag — mutation no-drag back on the row turns red', () => {
      setSession({
        status: 'running',
        parallelWork: { running: 2, unknown: 0, failed: 0, stopped: 0 },
      })
      headerWidth(400)
      renderView()
      const header = document.querySelector<HTMLElement>(
        '[data-conversation-header]',
      )!
      expect(header).toHaveAttribute('data-header-rows', '2')
      const statusRow = header.querySelector<HTMLElement>(
        '[data-header-status-row]',
      )!
      expect(statusRow).not.toHaveAttribute('data-app-region')
      expect(statusRow.style.getPropertyValue('-webkit-app-region')).toBe('')
      expect(
        statusRow.closest('[data-app-region]')?.getAttribute('data-app-region'),
      ).toBe('drag')
      const buttons = statusRow.querySelectorAll('button')
      expect([...buttons].map((button) => button.textContent)).toEqual([
        'Parallel work · 2',
      ])
      for (const button of buttons)
        expect(
          button.closest('[data-app-region]')?.getAttribute('data-app-region'),
        ).toBe('no-drag')
    })

    it('R7 every button in the header sits inside a no-drag region, and the header itself drags — mutation remove no-drag from the right-hand group turns red', () => {
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) => ({
          ...session,
          status: 'running' as const,
        })),
      }))
      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
      const header = document.querySelector<HTMLElement>(
        '[data-conversation-header]',
      )!
      expect(header).toHaveAttribute('data-app-region', 'drag')
      const buttons = header.querySelectorAll('button')
      // The right-hand group is in the sweep: Stop and More live there.
      expect(
        [...buttons].map((button) => button.getAttribute('aria-label')),
      ).toEqual(
        expect.arrayContaining(['Stop Test session', 'Session actions']),
      )
      for (const button of buttons)
        expect(
          button.closest('[data-app-region]')?.getAttribute('data-app-region'),
          button.textContent ?? '',
        ).toBe('no-drag')
    })
  })
  describe('MAR-3429 CH4 the header’s groups', () => {
    afterEach(() => {
      vi.restoreAllMocks()
      localStorage.clear()
      useTranscriptViewStore.setState({ modes: {} })
      useAgentMeterStore.setState({
        snapshot: { agents: null, convergence: null, rows: [] },
      })
    })

    const renderView = () =>
      render(
        <TooltipProvider>
          <SessionView />
        </TooltipProvider>,
      )
    const header = () =>
      document.querySelector<HTMLElement>('[data-conversation-header]')!
    const setSession = (patch: Record<string, unknown>) =>
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((session) => ({ ...session, ...patch })),
      }))
    const toolItem = (id: string, sequence: number, rest: object) => ({
      id,
      sessionId: 'session-1',
      sequence,
      turnId: 'turn-1',
      state: 'complete' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      providerMeta: {
        providerId: 'claude-code',
        providerItemId: null,
        providerEventType: null,
      },
      ...rest,
    })
    const harnessAlert = () =>
      vi.mocked(window.electronAPI.session.harnessFacts).mockResolvedValue({
        turns: [],
        currentTurn: null,
        compactions: [],
        rateLimit: null,
        init: {
          kind: 'harness.init',
          at: 'now',
          claudeCodeVersion: null,
          model: null,
          permissionMode: null,
          mcpServers: {
            total: 1,
            connected: 0,
            others: [{ name: 'linear', status: 'failed' }],
            omittedAlerts: 0,
            omitted: 0,
          },
          plugins: null,
          capabilities: null,
          tools: null,
          skills: null,
          slashCommands: null,
        },
      })
    const meterReading = () =>
      useAgentMeterStore.setState({
        snapshot: {
          agents: null,
          convergence: null,
          rows: [
            {
              sessionId: 'session-1',
              account: null,
              usage: { cpu: 5, memoryMb: 120 },
            },
          ],
        },
      })

    it('R1 choosing Full from View switches the transcript, and no switch sits in the row — mutation the switch still in the row turns red', async () => {
      useSessionStore.setState({
        activeConversation: [
          toolItem('u1', 1, { kind: 'message', actor: 'user', text: 'look' }),
          toolItem('r1', 2, {
            kind: 'tool-call',
            toolName: 'Read',
            inputText: JSON.stringify({ file_path: '/tmp/project/a.md' }),
          }),
          toolItem('r2', 3, {
            kind: 'tool-call',
            toolName: 'Read',
            inputText: JSON.stringify({ file_path: '/tmp/project/b.md' }),
          }),
          toolItem('m1', 4, {
            kind: 'message',
            actor: 'assistant',
            text: 'done',
          }),
        ] as never,
      })
      renderView()
      const toolRows = () =>
        ['r1', 'r2'].filter((id) =>
          document.querySelector(`[data-conversation-item-id="${id}"]`),
        )
      expect(
        within(header()).queryByRole('group', { name: 'Conversation view' }),
      ).toBeNull()
      expect(
        within(header()).queryByRole('button', { name: 'Full' }),
      ).toBeNull()
      expect(toolRows()).toEqual([])

      openGroup('View')
      const choice = await screen.findByRole('group', {
        name: 'Conversation view',
      })
      expect(
        within(choice).getByRole('menuitemradio', { name: 'Compact' }),
      ).toHaveAttribute('aria-checked', 'true')
      fireEvent.click(
        within(choice).getByRole('menuitemradio', { name: 'Full' }),
      )
      await waitFor(() => expect(toolRows()).toEqual(['r1', 'r2']))
    })

    it('R2 Parallel work is in the row only while it runs, reading its count; otherwise its history is in View — mutation always in the row turns red', async () => {
      setSession({
        parallelWork: { running: 2, unknown: 0, failed: 0, stopped: 0 },
      })
      const first = renderView()
      expect(
        within(header()).getByRole('button', { name: 'Parallel work · 2' }),
      ).toBeInTheDocument()
      first.unmount()

      setSession({
        parallelWork: { running: 0, unknown: 0, failed: 3, stopped: 12 },
      })
      sessionRowWidth(1700)
      renderView()
      expect(
        within(header()).queryByRole('button', { name: /^Parallel work/ }),
      ).toBeNull()
      const view = screen.getByRole('button', { name: 'View' })
      view.focus()
      openGroup('View')
      fireEvent.click(
        await screen.findByRole('menuitem', { name: 'Parallel work history' }),
      )
      const close = await screen.findByRole('button', {
        name: 'Close parallel work',
      })
      close.focus()
      fireEvent.click(close)
      // Back to View, which it was opened from.
      await waitFor(() => expect(document.activeElement).toBe(view))
    })

    it('R3 no alert, no harness chip in the row; CPU and memory only inside Details — mutation the harness chip always in the row turns red', async () => {
      meterReading()
      renderView()
      await act(async () => {})
      expect(screen.queryByTestId('harness-alert')).toBeNull()
      expect(within(header()).queryByTestId('session-agent-meter')).toBeNull()
      expect(within(header()).queryByText(/5% · 120 MB/)).toBeNull()
      openGroup('Details')
      const agent = await screen.findByRole('region', { name: 'Agent' })
      expect(
        within(agent).getByTestId('session-agent-meter'),
      ).toHaveTextContent('5% · 120 MB')
    })

    it('R3 an alert is a chip naming its cause, and it opens Details at the harness, with focus back on the chip after — mutation drop the section focus turns red', async () => {
      harnessAlert()
      renderView()
      const chip = await screen.findByTestId('harness-alert')
      expect(chip).toHaveTextContent('Harness · 1 integration failed')
      expect(header().contains(chip)).toBe(true)
      chip.focus()
      fireEvent.click(chip)
      const harness = await screen.findByRole('region', {
        name: 'Harness history',
      })
      await waitFor(() => expect(document.activeElement).toBe(harness))
      expect(harness).toHaveTextContent('linear · failed')
      await act(async () =>
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' }),
      )
      await waitFor(() => expect(document.activeElement).toBe(chip))
    })

    it('R4 a session whose project is not the sidebar’s runs its own project’s command — mutation activeProject back turns red', async () => {
      const emergence = {
        ...sidebarProject,
        id: 'project-2',
        name: 'emergence',
        repositoryPath: '/tmp/emergence',
      }
      useProjectStore.setState({ projects: [sidebarProject, emergence] })
      setSession({ projectId: 'project-2', workingDirectory: '/tmp/emergence' })
      vi.mocked(window.electronAPI.projectScripts.list).mockImplementation(
        async (projectId: string) =>
          projectId === 'project-2'
            ? [{ ...devScript, id: 'script-2', projectId, name: 'Build' }]
            : [devScript],
      )
      vi.mocked(window.electronAPI.projectScripts.run).mockResolvedValue({
        ...devRun,
        scriptId: 'script-2',
        projectId: 'project-2',
      })
      renderView()
      openGroup('Project')
      fireEvent.click(await screen.findByTitle('Run Build'))
      expect(screen.queryByTitle('Run Dev')).toBeNull()
      await waitFor(() =>
        expect(window.electronAPI.projectScripts.run).toHaveBeenCalledWith(
          'script-2',
          { cwd: '/tmp/emergence' },
        ),
      )
    })

    it('R4 a removed worktree opens the session’s own project, not the sidebar’s — mutation activeProject back turns red', async () => {
      const emergence = {
        ...sidebarProject,
        id: 'project-2',
        name: 'emergence',
        repositoryPath: '/tmp/emergence',
      }
      useProjectStore.setState({ projects: [sidebarProject, emergence] })
      useWorkspaceStore.setState((state) => ({
        globalWorkspaces: state.globalWorkspaces.map((workspace) => ({
          ...workspace,
          projectId: 'project-2',
          worktreeRemovedAt: '2026-09-01T00:00:00.000Z',
        })),
      }))
      setSession({ projectId: 'project-2' })
      renderView()
      await act(async () => {
        await Promise.resolve()
      })
      openGroup('Project')
      fireEvent.click(
        await screen.findByRole('menuitem', { name: 'Open in VS Code' }),
      )
      await waitFor(() =>
        expect(window.electronAPI.projectOpen?.open).toHaveBeenCalledWith({
          appId: 'vscode',
          path: '/tmp/emergence',
        }),
      )
    })

    it.each([
      ['drawn', 2400],
      ['yielded', 400],
    ] as const)(
      'R9 the PR panel opened from the Project group, %s, hands focus back to where the group lives when it closes — mutation no focus return turns red',
      async (state, width) => {
        headerWidth(width)
        renderView()
        if (state === 'drawn') openGroup('Project')
        else {
          openGroup('Session actions')
          fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Project' }),
          )
        }
        fireEvent.click(
          await screen.findByRole('menuitemcheckbox', {
            name: /^Pull request/,
          }),
        )
        const close = await screen.findByRole('button', {
          name: 'Close pull request panel',
        })
        close.focus()
        fireEvent.click(close)
        expect(
          screen.queryByRole('button', { name: 'Close pull request panel' }),
        ).toBeNull()
        expect(document.activeElement).toBe(
          state === 'drawn'
            ? screen.getByRole('button', { name: 'Project' })
            : screen.getByRole('button', { name: 'Session actions' }),
        )
      },
    )

    it('R7 every button in the header is h-7 — mutation h-10 back on any turns red', async () => {
      harnessAlert()
      setSession({
        status: 'running',
        parallelWork: { running: 2, unknown: 0, failed: 0, stopped: 0 },
      })
      renderView()
      await screen.findByTestId('harness-alert')
      const buttons = [...header().querySelectorAll('button')]
      // The whole row: Parallel work, the harness chip, the three groups,
      // Stop and More.
      expect(buttons.length).toBeGreaterThanOrEqual(7)
      for (const button of buttons)
        expect(
          button.className.split(/\s+/),
          button.textContent || button.getAttribute('aria-label') || '',
        ).toContain('h-7')
      for (const button of buttons)
        expect(button.className).not.toMatch(/\bh-(8|9|10)\b/)
    })

    /**
     * Every capability the header had, with the path of roles and names that
     * reaches it now (R8). Each row renders its own header: removing any one
     * of them turns exactly that row red.
     */
    const reach =
      (role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio') =>
      (name: string | RegExp) =>
      () =>
        screen.findByRole(role, { name })
    const inRegion = (region: string, text: string) => async () =>
      within(await screen.findByRole('region', { name: region })).getByText(
        text,
      )
    const capabilities: Array<
      [
        string,
        'View' | 'Details' | 'Project' | 'Session actions' | null,
        () => Promise<HTMLElement>,
      ]
    > = [
      ['Compact', 'View', reach('menuitemradio')('Compact')],
      ['Full', 'View', reach('menuitemradio')('Full')],
      [
        'Parallel work history',
        'View',
        reach('menuitem')('Parallel work history'),
      ],
      ['Checkout branch', 'Details', inRegion('Session', 'Checkout branch')],
      ['Pull request row', 'Details', inRegion('Session', 'Pull request')],
      ['Context', 'Details', inRegion('Session', 'Context')],
      ['Activity', 'Details', inRegion('Session', 'Activity')],
      [
        'harness history',
        'Details',
        () => screen.findByRole('region', { name: 'Harness history' }),
      ],
      ['CPU and memory', 'Details', inRegion('Agent', 'CPU / memory')],
      ['Project actions', 'Project', () => screen.findByTitle('Run Dev')],
      [
        'Open',
        'Project',
        async () =>
          within(
            await screen.findByRole('group', { name: 'Open in' }),
          ).findByRole('menuitem', { name: 'Open in VS Code' }),
      ],
      ['Pull request', 'Project', reach('menuitemcheckbox')(/^Pull request/)],
      ['Terminal', 'Project', reach('menuitem')('Open terminal')],
      ['Pin', 'Session actions', reach('menuitemcheckbox')('Pin conversation')],
      ['Fork', 'Session actions', reach('menuitem')('Fork session…')],
      [
        'Link to Space',
        'Session actions',
        reach('menuitem')('Link to Space...'),
      ],
      ['debug log', 'Session actions', reach('menuitem')('Open debug log…')],
      [
        'Stop',
        null,
        async () => screen.getByRole('button', { name: 'Stop Test session' }),
      ],
    ]

    it.each(capabilities)(
      'R8 %s is reachable from %s — mutation remove it turns red',
      async (_, group, find) => {
        vi.mocked(window.electronAPI.projectScripts.list).mockResolvedValue([
          devScript,
        ])
        meterReading()
        const settings = useAppSettingsStore.getState().settings
        useAppSettingsStore.setState({
          settings: {
            ...settings,
            debugLogging: { ...settings.debugLogging, enabled: true },
          },
        })
        setSession({ status: 'running', activity: 'thinking' })
        try {
          renderView()
          await act(async () => {
            await Promise.resolve()
          })
          if (group) openGroup(group)
          expect(await find()).toBeInTheDocument()
        } finally {
          useAppSettingsStore.setState({ settings })
        }
      },
    )

    describe('lap 2 (verdict bd69905f)', () => {
      afterEach(() => {
        vi.unstubAllGlobals()
      })

      /**
       * A session row laid out as the browser lays it: the row is `row` wide,
       * and the header pays for every panel docked beside it right now (the
       * PR panel 320, docked Parallel work 420), read from the DOM at the
       * moment it is measured. The groups measure `groupWidth`, anything else
       * drawn 60. The ResizeObservers fire only on `settle` -- the frame after
       * a commit -- so a width read in the commit itself is the header's own
       * doing (A).
       */
      function dockingGeometry(row: number, groupWidth: number) {
        const observers = new Set<() => void>()
        vi.stubGlobal(
          'ResizeObserver',
          class {
            constructor(private readonly callback: () => void) {}
            observe() {
              observers.add(this.callback)
            }
            unobserve() {}
            disconnect() {
              observers.delete(this.callback)
            }
          },
        )
        const docked = () => {
          let width = 0
          if (document.querySelector('[aria-label="Close pull request panel"]'))
            width += 320
          const parallel = document.querySelector(
            '[aria-label="Close parallel work"]',
          )
          if (parallel && !parallel.closest('[role="dialog"]')) width += 420
          return width
        }
        const measure = HTMLElement.prototype.getBoundingClientRect
        vi.spyOn(
          HTMLElement.prototype,
          'getBoundingClientRect',
        ).mockImplementation(function (this: HTMLElement) {
          if (this.hasAttribute('data-session-row'))
            return { width: row } as DOMRect
          if (this.hasAttribute('data-conversation-header'))
            return { width: row - docked() } as DOMRect
          const inner = this.getAttribute('data-header-inner')
          if (inner !== null)
            return {
              width:
                this.childElementCount === 0
                  ? 0
                  : ['project', 'view', 'details'].includes(inner)
                    ? groupWidth
                    : 60,
            } as DOMRect
          return measure.call(this)
        })
        vi.spyOn(
          HTMLElement.prototype,
          'scrollWidth',
          'get',
        ).mockImplementation(function (this: HTMLElement) {
          if (this.hasAttribute('data-header-project')) return 90
          if (this.hasAttribute('data-header-name')) return 200
          return 0
        })
        return {
          settle: () => act(() => observers.forEach((notify) => notify())),
        }
      }
      const yielded = (id: string) =>
        header().querySelector(`[data-header-item="${id}"][data-yielded]`) !==
        null
      const trigger = (name: 'Project' | 'View') =>
        within(header()).getByRole('button', { name, hidden: true })

      it('A closing the docked PR panel hands focus to Project, drawn again at the header’s real width in the same commit — mutation drop the docked re-read turns red', async () => {
        // 1200 px: every group is drawn. The PR panel docks 320 px of it, and
        // at 880 Project yields; closed, the header is 1200 again.
        const geometry = dockingGeometry(1200, 250)
        renderView()
        expect(yielded('project')).toBe(false)
        openGroup('Project')
        fireEvent.click(
          await screen.findByRole('menuitemcheckbox', {
            name: /^Pull request/,
          }),
        )
        const close = await screen.findByRole('button', {
          name: 'Close pull request panel',
        })
        geometry.settle()
        expect(yielded('project')).toBe(true)
        close.focus()
        fireEvent.click(close)
        expect(document.activeElement).toBe(trigger('Project'))
        expect(yielded('project')).toBe(false)
      })

      it('A closing docked Parallel work opened from View hands focus to View, drawn again in the same commit — mutation drop the docked re-read turns red', async () => {
        // 1200 px: every group is drawn. Parallel work docks 420 px of it (780
        // is still a conversation's width), and at 780 View yields as well.
        const geometry = dockingGeometry(1200, 250)
        renderView()
        expect(yielded('view')).toBe(false)
        openGroup('View')
        fireEvent.click(
          await screen.findByRole('menuitem', {
            name: 'Parallel work history',
          }),
        )
        const close = await screen.findByRole('button', {
          name: 'Close parallel work',
        })
        expect(close.closest('[role="dialog"]')).toBeNull()
        geometry.settle()
        expect(yielded('view')).toBe(true)
        close.focus()
        fireEvent.click(close)
        expect(document.activeElement).toBe(trigger('View'))
        expect(yielded('view')).toBe(false)
      })

      it('B Parallel work history from a drawn View, docked, leaves focus on View, never the page — mutation preventDefault back unconditionally turns red', async () => {
        dockingGeometry(1700, 90)
        renderView()
        const view = trigger('View')
        view.focus()
        openGroup('View')
        fireEvent.click(
          await screen.findByRole('menuitem', {
            name: 'Parallel work history',
          }),
        )
        const close = await screen.findByRole('button', {
          name: 'Close parallel work',
        })
        expect(close.closest('[role="dialog"]')).toBeNull()
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
        })
        expect(document.activeElement).not.toBe(document.body)
        expect(document.activeElement).toBe(view)
      })

      it('B Parallel work history from a drawn View, as the overlay, puts focus inside the overlay — mutation preventDefault back unconditionally keeps it there too', async () => {
        // jsdom's row measures 0: Parallel work opens as the overlay.
        renderView()
        const view = trigger('View')
        view.focus()
        openGroup('View')
        fireEvent.click(
          await screen.findByRole('menuitem', {
            name: 'Parallel work history',
          }),
        )
        const dialog = await screen.findByRole('dialog')
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
        })
        expect(document.activeElement).not.toBe(document.body)
        expect(dialog.contains(document.activeElement)).toBe(true)
      })

      it('C a right-click outside Details opened from the harness chip leaves focus where it is — mutation the chip branch ignores the outside interaction turns red', async () => {
        harnessAlert()
        renderView()
        const outside = document.createElement('p')
        document.body.append(outside)
        const chip = await screen.findByTestId('harness-alert')
        chip.focus()
        fireEvent.click(chip)
        const harness = await screen.findByRole('region', {
          name: 'Harness history',
        })
        await waitFor(() => expect(document.activeElement).toBe(harness))
        await act(async () => fireEvent.pointerDown(outside, { button: 2 }))
        await waitFor(() =>
          expect(
            screen.queryByRole('region', { name: 'Harness history' }),
          ).toBeNull(),
        )
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
        })
        expect(document.activeElement).not.toBe(chip)
        expect(document.activeElement).toBe(document.body)
        outside.remove()
      })

      it('D one PR refresh per PR panel open and per Details or Project open, none on a close — mutation the one effect over all three turns red', async () => {
        const refresh = vi.mocked(
          window.electronAPI.pullRequest.refreshForSession,
        )
        const closeMenu = async () => {
          await act(async () =>
            fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' }),
          )
          await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
        }
        renderView()
        await act(async () => {})
        refresh.mockClear()

        openGroup('Project')
        await screen.findByRole('menu')
        await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
        fireEvent.click(
          await screen.findByRole('menuitemcheckbox', {
            name: /^Pull request/,
          }),
        )
        await screen.findByRole('button', { name: 'Close pull request panel' })
        await act(async () => {})
        // Project's open, then the panel's: two, and nothing for Project
        // closing as the item was chosen.
        expect(refresh).toHaveBeenCalledTimes(2)

        openGroup('Details')
        await screen.findByRole('menu')
        await act(async () => {})
        expect(refresh).toHaveBeenCalledTimes(3)
        await closeMenu()
        expect(refresh).toHaveBeenCalledTimes(3)

        openGroup('Project')
        await screen.findByRole('menu')
        await act(async () => {})
        expect(refresh).toHaveBeenCalledTimes(4)
        await closeMenu()

        fireEvent.click(
          screen.getByRole('button', { name: 'Close pull request panel' }),
        )
        await act(async () => {})
        expect(refresh).toHaveBeenCalledTimes(4)
      })

      it('D the Open in list is read once while the header lives: a second Project open shows the apps at once, with nothing detecting — mutation read it on each open turns red', async () => {
        const listApps = vi.mocked(window.electronAPI.projectOpen!.listApps)
        listApps.mockClear()
        renderView()
        await act(async () => {})
        for (let open = 0; open < 2; open += 1) {
          openGroup('Project')
          const menu = await screen.findByRole('menu')
          expect(within(menu).queryByText('Detecting apps...')).toBeNull()
          expect(
            within(menu).getByRole('menuitem', { name: 'Open in VS Code' }),
          ).toBeInTheDocument()
          await act(async () => fireEvent.keyDown(menu, { key: 'Escape' }))
          await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
        }
        expect(listApps).toHaveBeenCalledTimes(1)
      })

      it('E Details has one Harness heading, and the harness section the chip focuses shows a focus-visible ring — mutation the outer heading back turns red', async () => {
        harnessAlert()
        renderView()
        await screen.findByTestId('harness-alert')
        openGroup('Details')
        const harness = await screen.findByRole('region', {
          name: 'Harness history',
        })
        expect(
          within(screen.getByRole('menu')).getAllByRole('heading', {
            name: /harness/i,
          }),
        ).toHaveLength(1)
        expect(harness.className.split(/\s+/)).toEqual(
          expect.arrayContaining([
            'focus-visible:ring-2',
            'focus-visible:ring-ring',
          ]),
        )
      })
    })

    describe('CH4b (MAR-3466)', () => {
      const refresh = () =>
        vi.mocked(window.electronAPI.pullRequest.refreshForSession)

      it('R1 switching the conversation while Details stays open refreshes the new conversation’s PR once, in order — mutation no refresh on the change turns red', async () => {
        useSessionStore.setState((state) => ({
          sessions: [
            state.sessions[0],
            {
              ...state.sessions[0],
              id: 'session-2',
              name: 'Parent',
            },
          ],
        }))
        renderView()
        openGroup('Details')
        await screen.findByRole('menu')
        await waitFor(() =>
          expect(refresh().mock.calls.map((call) => call[0])).toEqual([
            'session-1',
          ]),
        )
        act(() => useSessionStore.setState({ activeSessionId: 'session-2' }))
        await waitFor(() =>
          expect(refresh().mock.calls.map((call) => call[0])).toEqual([
            'session-1',
            'session-2',
          ]),
        )
      })

      it('R1 switching the conversation while Project stays open refreshes the new conversation’s PR once, in order — mutation drop Project from the open-group read turns red', async () => {
        useSessionStore.setState((state) => ({
          sessions: [
            state.sessions[0],
            {
              ...state.sessions[0],
              id: 'session-2',
              name: 'Parent',
            },
          ],
        }))
        renderView()
        openGroup('Project')
        await screen.findByRole('menu')
        await waitFor(() =>
          expect(refresh().mock.calls.map((call) => call[0])).toEqual([
            'session-1',
          ]),
        )
        act(() => useSessionStore.setState({ activeSessionId: 'session-2' }))
        await waitFor(() =>
          expect(refresh().mock.calls.map((call) => call[0])).toEqual([
            'session-1',
            'session-2',
          ]),
        )
      })

      it('R2 the harness chip opens Details and refreshes the PR once — mutation the chip skips the refresh turns red', async () => {
        harnessAlert()
        renderView()
        const chip = await screen.findByTestId('harness-alert')
        refresh().mockClear()
        fireEvent.click(chip)
        await screen.findByRole('region', { name: 'Harness history' })
        expect(refresh()).toHaveBeenCalledTimes(1)
        expect(refresh()).toHaveBeenCalledWith('session-1')
      })

      it('R2 More opens Details and refreshes the PR once — mutation the More entry calls setDetailsOpen(true) turns red', async () => {
        headerWidth(400)
        renderView()
        await act(async () => {})
        refresh().mockClear()
        fireEvent.pointerDown(
          screen.getByRole('button', { name: 'Session actions' }),
        )
        fireEvent.click(
          await screen.findByRole('menuitem', { name: 'Details' }),
        )
        await waitFor(() => expect(refresh()).toHaveBeenCalledTimes(1))
        expect(refresh()).toHaveBeenCalledWith('session-1')
      })

      it('R2 More opens Project and refreshes the PR once — mutation the More entry calls setProjectOpen(true) turns red', async () => {
        headerWidth(400)
        renderView()
        await act(async () => {})
        refresh().mockClear()
        fireEvent.pointerDown(
          screen.getByRole('button', { name: 'Session actions' }),
        )
        fireEvent.click(
          await screen.findByRole('menuitem', { name: 'Project' }),
        )
        await waitFor(() => expect(refresh()).toHaveBeenCalledTimes(1))
        expect(refresh()).toHaveBeenCalledWith('session-1')
      })

      it('R6 closing the pull request panel with its own button while Project stays open does not refresh again — mutation showPullRequestPanel || prGroupOpen.current turns red', async () => {
        renderView()
        openGroup('Project')
        await screen.findByRole('menu')
        await waitFor(() => expect(refresh()).toHaveBeenCalledTimes(1))
        fireEvent.click(
          await screen.findByRole('menuitemcheckbox', {
            name: /^Pull request/,
          }),
        )
        await screen.findByRole('button', { name: 'Close pull request panel' })
        await waitFor(() => expect(refresh()).toHaveBeenCalledTimes(2))
        openGroup('Project')
        const projectMenu = await screen.findByRole('menu')
        await waitFor(() => expect(refresh()).toHaveBeenCalledTimes(3))
        expect(projectMenu).toBeInTheDocument()
        fireEvent.click(
          screen.getByRole('button', {
            name: 'Close pull request panel',
            hidden: true,
          }),
        )
        await act(async () => {})
        expect(refresh()).toHaveBeenCalledTimes(3)
      })
    })
  })
})
