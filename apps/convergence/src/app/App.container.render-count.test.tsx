import { Profiler } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { useSpaceStore } from '@/entities/space'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useSessionRelayStore } from '@/entities/session-relay'
import { useNotificationsStore } from '@/entities/notifications'
import { useUpdatesStore } from '@/entities/updates'
import { useProviderUpdatesStore } from '@/entities/provider-updates'
import { switchToSession } from '@/features/command-center'
import type { AppShell } from './App.layout'
import { App, type MainViewRoute } from './App.container'

/**
 * How often the app shell itself re-renders while conversations stream
 * (MAR-3377 R1).
 *
 * The root measured is `App` (App.container.tsx) -- the smallest component
 * that holds route resolution. Its children are stubbed so the Profiler
 * counts App's own commits only: the sidebar, the Loom panel and the composer
 * each have their own store listeners (F1b/F1c/F1d own those), and counting
 * them here would measure their work, not the shell's.
 */

type ShellProps = Parameters<typeof AppShell>[0]
const shell: { props: ShellProps | null } = { props: null }

vi.mock('./App.layout', () => ({
  AppShell: (props: ShellProps) => {
    shell.props = props
    return null
  },
}))
vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}))
vi.mock('@/features/command-center', () => ({
  CommandCenterContainer: () => null,
  activateProject: vi.fn(),
  switchToSession: vi.fn(async () => undefined),
}))
vi.mock('@/features/space-session-link', () => ({
  SpaceSessionLinkDialogContainer: () => null,
}))
vi.mock('@/features/session-fork', () => ({
  SessionForkDialogContainer: () => null,
}))
vi.mock('@/features/session-intent-dialog', () => ({
  SessionIntentDialogContainer: () => null,
}))
vi.mock('@/features/notifications-toast-host', () => ({
  NotificationsToastHostContainer: () => null,
}))
vi.mock('@/features/context-alert', () => ({
  ContextAlertHostContainer: () => null,
}))
vi.mock('@/features/context-drill-host', () => ({
  ContextDrillHostContainer: () => null,
}))
vi.mock('@/features/updates-toast', () => ({
  UpdatesToastContainer: () => null,
}))
vi.mock('@/features/provider-updates-toast', () => ({
  ProviderUpdatesToastContainer: () => null,
}))
vi.mock('@/features/feedback-button', () => ({
  FeedbackButtonContainer: () => null,
}))

const project = {
  id: 'p1',
  name: 'project',
  repositoryPath: '/tmp/project',
  settings: DEFAULT_PROJECT_SETTINGS,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  laneOf: null,
  laneName: null,
}

function summary(
  id: string,
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id,
    contextKind: 'project',
    projectId: 'p1',
    workspaceId: null,
    providerId: 'claude-code',
    model: 'sonnet',
    effort: 'medium',
    name: id,
    status: 'running',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp/project',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const noopAsync = async () => undefined

/** Every bridge method the shell calls directly answers with an unsubscribe. */
function stubBridge() {
  const namespace = () =>
    new Proxy({}, { get: () => vi.fn(() => () => undefined) })
  const bridge = new Proxy(
    { perf: { isEnabled: () => false } } as Record<string, unknown>,
    { get: (target, key: string) => (target[key] ??= namespace()) },
  )
  Object.defineProperty(window, 'electronAPI', {
    value: bridge,
    writable: true,
    configurable: true,
  })
}

function seedStores(options: {
  globalSessions: SessionSummary[]
  activeSessionId: string | null
  loadGlobalSessions?: () => Promise<void>
}) {
  useProjectStore.setState({
    projects: [project],
    activeProject: project,
    loading: false,
    error: null,
    loadActiveProject: noopAsync,
  })
  useWorkspaceStore.setState({
    workspaces: [],
    globalWorkspaces: [],
    error: null,
    loadGlobalWorkspaces: noopAsync,
  })
  useSpaceStore.setState({ spaces: [], loading: false, loadSpaces: noopAsync })
  useSessionStore.setState({
    globalSessions: options.globalSessions,
    globalChatSessions: [],
    sessions: options.globalSessions,
    needsYouDismissals: {},
    activeSessionId: options.activeSessionId,
    activeGlobalSessionId: null,
    error: null,
    loadGlobalSessions: options.loadGlobalSessions ?? noopAsync,
    loadGlobalChatSessions: noopAsync,
    loadRecents: noopAsync,
  })
  useAppSettingsStore.setState({ load: noopAsync })
  useSessionRelayStore.setState({ load: noopAsync })
  useNotificationsStore.setState({
    loadPrefs: noopAsync,
    setActiveSession: noopAsync,
  })
  useUpdatesStore.setState({ loadInitial: noopAsync })
  useProviderUpdatesStore.setState({
    loadInitial: noopAsync,
    stopBackgroundChecks: () => undefined,
  })
}

function mountCounted(route: MainViewRoute) {
  const commits = { count: 0 }
  render(
    <Profiler id="app-shell" onRender={() => (commits.count += 1)}>
      <App mainViewRoute={route} />
    </Profiler>,
  )
  return commits
}

const routeA: MainViewRoute = { kind: 'code-session', sessionId: 'A' }

describe('App shell render count (MAR-3377 R1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shell.props = null
    stubBridge()
  })

  async function mountReady() {
    seedStores({
      globalSessions: [summary('A'), summary('B')],
      activeSessionId: null,
    })
    const commits = mountCounted(routeA)
    // The route resolved `ready`: that is the only state that switches.
    await waitFor(() => expect(switchToSession).toHaveBeenCalledWith('A'))
    await act(async () => {})
    commits.count = 0
    return commits
  }

  it('commits 0 times on 20 summaries of another conversation — mutation subscribe App to the whole globalSessions turns red', async () => {
    const commits = await mountReady()

    // One act per summary: each arrives as its own IPC event in the app, and
    // one act around all twenty would batch them into a single commit.
    for (let i = 1; i <= 20; i += 1) {
      act(() => {
        useSessionStore.getState().handleSessionSummaryUpdate(
          summary('B', {
            status: i % 2 ? 'running' : 'completed',
            updatedAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
          }),
        )
      })
    }

    expect(commits.count).toBe(0)
  })

  it('commits 0 times on 20 summaries of the routed conversation that change only updatedAt/status/activity', async () => {
    const commits = await mountReady()

    for (let i = 1; i <= 20; i += 1) {
      act(() => {
        useSessionStore.getState().handleSessionSummaryUpdate(
          summary('A', {
            status: i % 2 ? 'running' : 'completed',
            attention: i % 2 ? 'none' : 'finished',
            activity: i % 2 ? 'streaming' : null,
            updatedAt: `2026-01-01T00:01:${String(i).padStart(2, '0')}.000Z`,
          }),
        )
      })
    }

    expect(commits.count).toBe(0)
  })

  it('re-resolves the route when the routed conversation is archived', async () => {
    const commits = await mountReady()
    expect(shell.props?.routeFallback).toBeNull()

    act(() => {
      useSessionStore
        .getState()
        .handleSessionSummaryUpdate(
          summary('A', { archivedAt: '2026-01-02T00:00:00.000Z' }),
        )
    })

    expect(commits.count).toBeGreaterThanOrEqual(1)
    expect(shell.props?.routeFallback?.reason).toBe('session-archived')
  })

  it('re-resolves the route when the routed conversation moves to a project that is gone', async () => {
    const commits = await mountReady()

    act(() => {
      useSessionStore
        .getState()
        .handleSessionSummaryUpdate(summary('A', { projectId: 'p-gone' }))
    })

    expect(commits.count).toBeGreaterThanOrEqual(1)
    expect(shell.props?.routeFallback?.reason).toBe('project-not-found')
  })

  it('switches when the route moves to another conversation (sidebar, Mission Control and Loom cards all navigate this way)', async () => {
    seedStores({
      globalSessions: [summary('A'), summary('B')],
      activeSessionId: null,
    })
    const { rerender } = render(<App mainViewRoute={routeA} />)
    await waitFor(() => expect(switchToSession).toHaveBeenCalledWith('A'))

    rerender(<App mainViewRoute={{ kind: 'code-session', sessionId: 'B' }} />)

    await waitFor(() => expect(switchToSession).toHaveBeenCalledWith('B'))
    expect(shell.props?.routeFallback).toBeNull()
  })

  it('opens a deep-linked conversation whose summary loads after the route', async () => {
    let release: () => void = () => undefined
    const loaded = new Promise<void>((resolve) => (release = resolve))
    seedStores({
      globalSessions: [],
      activeSessionId: null,
      loadGlobalSessions: async () => {
        await loaded
        useSessionStore.setState({ globalSessions: [summary('A')] })
      },
    })
    mountCounted(routeA)
    await act(async () => {})
    expect(switchToSession).not.toHaveBeenCalled()
    expect(shell.props?.routeFallback).toBeNull()

    await act(async () => release())

    await waitFor(() => expect(switchToSession).toHaveBeenCalledWith('A'))
    expect(shell.props?.routeFallback).toBeNull()
  })
})
