import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, useProjectStore } from '@/entities/project'
import { useDialogStore } from '@/entities/dialog'
import { useSpaceStore } from '@/entities/space'
import { useSessionStore } from '@/entities/session'
import { useSessionRelayStore } from '@/entities/session-relay'
import { useProjectScriptStore } from '@/entities/project-script'
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

describe('SessionView', () => {
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

  afterEach(() => {
    vi.clearAllMocks()
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
  it("shows a remote session the daemon's branch and pull request, never the local ones", async () => {
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
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Session details' }),
    )

    const panel = await screen.findByText('Works in')
    const rows = panel.closest('div')?.parentElement
    expect(rows).toBeTruthy()
    expect(rows?.textContent).toContain('agent/34372e47')
    // The two local rows, gone: this session runs on another machine and has
    // no worktree here to have a branch or a pull request on.
    expect(rows?.textContent).not.toContain('No workspace')
    expect(rows?.textContent).not.toContain('master')
    // The daemon could not be reached, so it never said whether it had opened
    // a pull request -- and `None yet` would be that claim (MAR-2718 round 2).
    // The branch stays: the record already knew it.
    expect(rows?.textContent).toContain('Could not read: daemon unreachable')
    expect(rows?.textContent).not.toContain('None yet')
  })

  /**
   * The pending half of the same law, on the rendered surface (MAR-2280): while
   * the fetch is in flight nobody has looked yet, so the row says it is asking.
   *
   * Mutation: collapse `asking` (or `unavailable`) to
   * `NO_REMOTE_PULL_REQUEST_LABEL` in `describeRemotePullRequest` and this row
   * and the one above go red together.
   */
  it('says it is asking while the daemon has not answered about the pull request', async () => {
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
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Session details' }),
    )

    const panel = await screen.findByText('Works in')
    const rows = panel.closest('div')?.parentElement
    expect(rows?.textContent).toContain('Asking')
    expect(rows?.textContent).not.toContain('None yet')
  })

  /**
   * The daemon answered and the field it sent was not a pull request, on the
   * rendered surface (MAR-2280 law, MAR-2718 round 2).
   *
   * This is the reading the old wire door could not produce at all: `typeof
   * value.prUrl === 'string' ? value.prUrl : null` turned a missing key, `42`,
   * `false`, `''` and `'ftp://x'` into the daemon's own negative, so the panel
   * printed `None yet` about a snapshot nobody could read. A successful fetch
   * is not the same thing as a legible answer.
   *
   * Mutation: map `unreadable` to `{ state: 'none' }` in
   * `readRemotePullRequest`, or collapse it in `describeRemotePullRequest`, and
   * this goes red.
   */
  it('says the read failed when the daemon sent an unreadable pull request', async () => {
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
          pullRequest: {
            kind: 'unreadable',
            reason: 'the daemon sent no pull request field',
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
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Session details' }),
    )

    const panel = await screen.findByText('Works in')
    const rows = panel.closest('div')?.parentElement
    await waitFor(() =>
      expect(rows?.textContent).toContain(
        'Could not read: the daemon sent no pull request field',
      ),
    )
    expect(rows?.textContent).not.toContain('None yet')
    // The workspace half of the same answer survives it.
    expect(rows?.textContent).toContain('agent/34372e47')
  })

  /**
   * And the one answer that IS a pull request, rendered as the link it is
   * (MAR-2280 law). The `url` arm has to survive the decode that closed the
   * others, or the row would trade one lie for a blank.
   *
   * Mutation: return `{ state: 'none' }` for the `url` arm of
   * `readRemotePullRequest` and this goes red.
   */
  it('renders the pull request the daemon actually opened', async () => {
    ;(
      window as unknown as {
        electronAPI: { executionHost: { getSessionWorkspace: unknown } }
      }
    ).electronAPI.executionHost.getSessionWorkspace = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        info: {
          workspace: null,
          pullRequest: {
            kind: 'url',
            url: 'https://github.com/marckraw/convergence/pull/544',
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
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Session details' }),
    )

    const panel = await screen.findByText('Works in')
    const rows = panel.closest('div')?.parentElement
    await waitFor(() =>
      expect(rows?.textContent).toContain(
        'https://github.com/marckraw/convergence/pull/544',
      ),
    )
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
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Session details' }),
    )

    const branchRow = await screen.findByText('Branch')
    const rows = branchRow.closest('div')?.parentElement
    expect(rows?.textContent).toContain('master')
    expect(rows?.textContent).toContain('Pull request')
    expect(rows?.textContent).not.toContain('Works in')
  })

  it('shows the wires leaving this session in the header', async () => {
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

    const chip = screen.getByRole('button', {
      name: '1 wire fires when this session finishes.',
    })
    expect(chip).toHaveTextContent('1 wire')

    fireEvent.click(chip)
    expect(
      await screen.findByText(
        'When Test session finishes, send its last message to Reviewer',
      ),
    ).toBeInTheDocument()
  })

  it('leaves the header alone for a session nothing is wired to', () => {
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    expect(screen.queryByText('1 wire')).not.toBeInTheDocument()
    expect(screen.queryByText('0 wires')).not.toBeInTheDocument()
  })

  it('opens the session workspace from the header menu', async () => {
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open project' }))
    fireEvent.click(await screen.findByText('VS Code'))

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

  it('runs project actions from the active session working directory', async () => {
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

    fireEvent.pointerDown(await screen.findByRole('button', { name: /dev/i }))
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
})
