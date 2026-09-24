import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, useProjectStore } from '@/entities/project'
import { useDialogStore } from '@/entities/dialog'
import { useSpaceStore } from '@/entities/space'
import { useSessionStore, type ConversationItem } from '@/entities/session'
import { useSessionRelayStore } from '@/entities/session-relay'
import { useProjectScriptStore } from '@/entities/project-script'
import { useWorkspaceStore } from '@/entities/workspace'
import { recordPerfCommit } from '@/shared/lib/usePerfProbe'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { formatConversationTotalDuration } from './conversation-total-duration.pure'
import { parallelWorkMarkers, withFetchedWorkItems } from './parallel-work.pure'
import { referencedAttachmentIdsKey } from './referenced-attachments.pure'
import { SessionView } from './session-view.container'

// MAR-3310 F1e R2 + R4, measured where the product measures: the real
// `transcript` Profiler root is on, and every commit it reports is counted.
vi.mock('@/shared/lib/perf.api', () => ({
  perfApi: { isEnabled: () => true, report: async () => null },
}))
vi.mock('@/shared/lib/usePerfProbe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/usePerfProbe')>()),
  recordPerfCommit: vi.fn(),
}))
// The per-list passes, counted by name (R4).
vi.mock('./conversation-total-duration.pure', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./conversation-total-duration.pure')>()
  return {
    ...actual,
    formatConversationTotalDuration: vi.fn(
      actual.formatConversationTotalDuration,
    ),
  }
})
vi.mock('./referenced-attachments.pure', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./referenced-attachments.pure')>()
  return {
    ...actual,
    referencedAttachmentIdsKey: vi.fn(actual.referencedAttachmentIdsKey),
  }
})
vi.mock('./parallel-work.pure', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./parallel-work.pure')>()
  return {
    ...actual,
    parallelWorkMarkers: vi.fn(actual.parallelWorkMarkers),
    withFetchedWorkItems: vi.fn(actual.withFetchedWorkItems),
  }
})

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
    getTotalSize: () => options.count * 160,
    measureElement: () => {},
    scrollToIndex: () => {},
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

describe('MAR-3310 F1e SessionView while a reply streams', () => {
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
          onSessionSummaryUpdate: vi.fn().mockReturnValue(() => {}),
          listAgentRuns: vi.fn().mockResolvedValue([]),
          listTasks: vi.fn().mockResolvedValue([]),
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

  const initial = useSessionStore.getInitialState()
  const streamingId = 'f1e-streaming'

  function item(
    index: number,
    overrides: Partial<ConversationItem> = {},
  ): ConversationItem {
    return {
      id: `f1e-item-${index}`,
      sessionId: 'session-1',
      sequence: index + 1,
      turnId: 'turn-1',
      kind: 'message',
      actor: index % 2 === 0 ? 'user' : 'assistant',
      state: 'complete',
      text: `said ${index}`,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      providerMeta: {
        providerId: 'claude-code',
        providerItemId: null,
        providerEventType: null,
      },
      ...overrides,
    } as ConversationItem
  }

  function streamingConversation() {
    // Real store handlers: the view is fed exactly as the IPC bridge feeds it.
    useSessionStore.setState((state) => ({
      handleSessionSummaryUpdate: initial.handleSessionSummaryUpdate,
      handleConversationPatched: initial.handleConversationPatched,
      sessions: state.sessions.map((session) => ({
        ...session,
        status: 'running' as const,
        attention: 'none' as const,
        hasActiveHandle: true,
      })),
      activeConversation: [
        ...Array.from({ length: 20 }, (_, index) => item(index)),
        item(20, { id: streamingId, state: 'streaming', text: 'growing' }),
      ],
    }))
  }

  function transcriptCommits() {
    return vi
      .mocked(recordPerfCommit)
      .mock.calls.filter(([id]) => id === 'transcript').length
  }

  async function renderView() {
    render(
      <TooltipProvider>
        <SessionView />
      </TooltipProvider>,
    )
    await act(async () => {})
  }

  it('R2 twenty summary updates that change no transcript field make zero transcript commits — mutation compare the whole session turns red', async () => {
    streamingConversation()
    await renderView()
    expect(transcriptCommits()).toBeGreaterThan(0)
    vi.mocked(recordPerfCommit).mockClear()
    const summary = useSessionStore.getState().sessions[0]!

    for (let tick = 1; tick <= 20; tick += 1) {
      act(() =>
        useSessionStore.getState().handleSessionSummaryUpdate({
          ...summary,
          activity: 'streaming',
          lastSequence: 20 + tick,
          updatedAt: `2026-01-01T00:00:${String(tick).padStart(2, '0')}.000Z`,
        }),
      )
    }

    expect(transcriptCommits()).toBe(0)
  })

  it('R4 two hundred appends run no per-list pass: total duration, attachment key, parallel-work markers and detail merge — mutation route appends through upsertConversationItem turns red', async () => {
    streamingConversation()
    await renderView()
    const passes = {
      formatConversationTotalDuration,
      referencedAttachmentIdsKey,
      parallelWorkMarkers,
      withFetchedWorkItems,
    }
    for (const pass of Object.values(passes)) {
      expect(vi.mocked(pass)).toHaveBeenCalled()
      vi.mocked(pass).mockClear()
    }

    let text = 'growing'
    for (let index = 0; index < 200; index += 1) {
      const words = ` word${index}`
      act(() =>
        useSessionStore.getState().handleConversationPatched({
          op: 'append',
          sessionId: 'session-1',
          itemId: streamingId,
          baseLength: text.length,
          append: words,
          updatedAt: '2026-01-01T00:00:02.000Z',
        }),
      )
      text += words
    }

    expect(
      Object.fromEntries(
        Object.entries(passes).map(([name, pass]) => [
          name,
          vi.mocked(pass).mock.calls.length,
        ]),
      ),
    ).toEqual({
      formatConversationTotalDuration: 0,
      referencedAttachmentIdsKey: 0,
      parallelWorkMarkers: 0,
      withFetchedWorkItems: 0,
    })
    expect(
      document.querySelector(`[data-conversation-item-id="${streamingId}"]`)
        ?.textContent,
    ).toContain(text)
  })
})
