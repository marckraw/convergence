import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { toast } from 'sonner'
import { useNotificationsStore } from '@/entities/notifications'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { useWorkspaceStore } from '@/entities/workspace'
import type { Project } from '@/entities/project'
import type { Session } from '@/entities/session'
import {
  NotificationsToastHostContainer,
  focusSessionAcrossProjects,
} from './toast-host.container'
import type {
  NotificationDispatchPayload,
  NotificationEvent,
} from '@/entities/notifications'

vi.mock('sonner', () => {
  const fn = Object.assign(vi.fn(), { error: vi.fn() })
  return { toast: fn }
})

vi.mock('@/shared/assets/sounds/chime-soft.wav', () => ({
  default: 'chime-soft.wav',
}))
vi.mock('@/shared/assets/sounds/chime-alert.wav', () => ({
  default: 'chime-alert.wav',
}))

interface SubscriberHooks {
  show?: (payload: NotificationDispatchPayload) => void
  play?: (payload: NotificationDispatchPayload) => void
  focus?: (sessionId: string) => void
  clear?: () => void
}

function installNotificationApi() {
  const hooks: SubscriberHooks = {}
  const api = {
    getPrefs: vi.fn().mockResolvedValue({}),
    setPrefs: vi.fn(),
    testFire: vi.fn(),
    setActiveSession: vi.fn(),
    onPrefsUpdated: vi.fn().mockReturnValue(() => {}),
    onShowToast: vi.fn((cb: (p: NotificationDispatchPayload) => void) => {
      hooks.show = cb
      return () => {}
    }),
    onPlaySound: vi.fn((cb: (p: NotificationDispatchPayload) => void) => {
      hooks.play = cb
      return () => {}
    }),
    onFocusSession: vi.fn((cb: (sessionId: string) => void) => {
      hooks.focus = cb
      return () => {}
    }),
    onClearUnread: vi.fn((cb: () => void) => {
      hooks.clear = cb
      return () => {}
    }),
  }
  ;(
    window as unknown as { electronAPI: { notifications: typeof api } }
  ).electronAPI = {
    notifications: api,
  }
  return { api, hooks }
}

function makeEvent(
  kind: NotificationEvent['kind'],
  sessionId = 'sess-1',
): NotificationEvent {
  return {
    id: 'evt-1',
    kind,
    sessionId,
    sessionName: 'My session',
    projectName: 'My project',
    firedAt: 0,
  }
}

describe('NotificationsToastHostContainer', () => {
  let playSoft: ReturnType<typeof vi.fn<() => Promise<void>>>
  let playAlert: ReturnType<typeof vi.fn<() => Promise<void>>>

  beforeEach(() => {
    vi.clearAllMocks()
    playSoft = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    playAlert = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = function play() {
      const url = (this as HTMLMediaElement).getAttribute('src') ?? ''
      const fn = url.includes('alert') ? playAlert : playSoft
      return fn()
    }
    useNotificationsStore.setState({
      unreadCount: 0,
      pulsingSessionIds: {},
    })
    useSessionStore.setState({ activeSessionId: null })
  })

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('shows a toast for finished events and increments unread', () => {
    const { hooks } = installNotificationApi()
    render(<NotificationsToastHostContainer />)

    hooks.show?.({
      channel: 'toast',
      event: makeEvent('agent.finished'),
      formatted: { title: 'My session finished', body: 'My project' },
    })

    expect(toast).toHaveBeenCalledWith(
      'My session finished',
      expect.objectContaining({ description: 'My project' }),
    )
    expect(useNotificationsStore.getState().unreadCount).toBe(1)
  })

  it('uses error toast for critical kinds', () => {
    const { hooks } = installNotificationApi()
    render(<NotificationsToastHostContainer />)

    hooks.show?.({
      channel: 'toast',
      event: makeEvent('agent.errored'),
      formatted: { title: 'My session errored', body: 'My project' },
    })

    expect(toast.error).toHaveBeenCalledWith(
      'My session errored',
      expect.objectContaining({ description: 'My project' }),
    )
  })

  it('inline-pulse channel triggers store pulseSession instead of a toast', () => {
    const { hooks } = installNotificationApi()
    render(<NotificationsToastHostContainer />)

    hooks.show?.({
      channel: 'inline-pulse',
      event: makeEvent('agent.finished', 'sess-42'),
      formatted: { title: 'x', body: 'y' },
    })

    expect(toast).not.toHaveBeenCalled()
    expect(useNotificationsStore.getState().pulsingSessionIds).toEqual({
      'sess-42': true,
    })
  })

  it('plays the soft chime for sound-soft and the alert chime for sound-alert', () => {
    const { hooks } = installNotificationApi()
    render(<NotificationsToastHostContainer />)

    hooks.play?.({
      channel: 'sound-soft',
      event: makeEvent('agent.finished'),
      formatted: { title: 't', body: 'b' },
    })
    expect(playSoft).toHaveBeenCalledTimes(1)
    expect(playAlert).not.toHaveBeenCalled()

    hooks.play?.({
      channel: 'sound-alert',
      event: makeEvent('agent.errored'),
      formatted: { title: 't', body: 'b' },
    })
    expect(playAlert).toHaveBeenCalledTimes(1)
  })

  it('focus-session activates the target session within the same project', async () => {
    const setActiveSession = vi.fn()
    const setActiveProject = vi.fn().mockResolvedValue(undefined)
    const project: Project = {
      id: 'proj-a',
      name: 'Project A',
      repositoryPath: '/tmp/proj-a',
      settings: {
        workspaceCreation: {
          startStrategy: 'base-branch',
          baseBranchName: null,
        },
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as Project
    const session: Session = {
      id: 'sess-99',
      projectId: 'proj-a',
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: 'medium',
      name: 'Target',
      status: 'running',
      attention: 'none',
      workingDirectory: '/tmp/proj-a',
      transcript: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as Session
    useProjectStore.setState({
      projects: [project],
      activeProject: project,
      setActiveProject,
    } as never)
    useSessionStore.setState({
      globalSessions: [session],
      setActiveSession,
    } as never)

    await focusSessionAcrossProjects('sess-99')
    expect(setActiveSession).toHaveBeenCalledWith('sess-99')
    expect(setActiveProject).not.toHaveBeenCalled()
  })

  it('focus-session hops projects before activating a session in another project', async () => {
    const setActiveSession = vi.fn()
    const setActiveProject = vi.fn().mockResolvedValue(undefined)
    const prepareForProject = vi.fn()
    const loadSessions = vi.fn().mockResolvedValue(undefined)
    const loadWorkspaces = vi.fn().mockResolvedValue(undefined)
    const loadCurrentBranch = vi.fn().mockResolvedValue(undefined)
    const projectA: Project = {
      id: 'proj-a',
      name: 'A',
      repositoryPath: '/tmp/a',
      settings: {
        workspaceCreation: {
          startStrategy: 'base-branch',
          baseBranchName: null,
        },
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as Project
    const projectB: Project = {
      ...projectA,
      id: 'proj-b',
      name: 'B',
      repositoryPath: '/tmp/b',
    } as Project
    const session: Session = {
      id: 'sess-77',
      projectId: 'proj-b',
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: 'medium',
      name: 'Cross-project',
      status: 'running',
      attention: 'none',
      workingDirectory: '/tmp/b',
      transcript: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as Session
    useProjectStore.setState({
      projects: [projectA, projectB],
      activeProject: projectA,
      setActiveProject,
    } as never)
    useSessionStore.setState({
      globalSessions: [session],
      setActiveSession,
      prepareForProject,
      loadSessions,
    } as never)
    useWorkspaceStore.setState({
      loadWorkspaces,
      loadCurrentBranch,
    } as never)

    await focusSessionAcrossProjects('sess-77')

    expect(prepareForProject).toHaveBeenCalledWith('proj-b')
    expect(setActiveProject).toHaveBeenCalledWith('proj-b')
    expect(loadWorkspaces).toHaveBeenCalledWith('proj-b')
    expect(loadCurrentBranch).toHaveBeenCalledWith('/tmp/b')
    expect(loadSessions).toHaveBeenCalledWith('proj-b')
    expect(setActiveSession).toHaveBeenCalledWith('sess-77')
  })

  it('focus-session is a no-op when the session id is unknown', async () => {
    const setActiveSession = vi.fn()
    useSessionStore.setState({ globalSessions: [], setActiveSession } as never)

    await focusSessionAcrossProjects('missing')

    expect(setActiveSession).not.toHaveBeenCalled()
  })

  it('clear-unread broadcast resets the counter', () => {
    const { hooks } = installNotificationApi()
    useNotificationsStore.setState({ unreadCount: 4 })
    render(<NotificationsToastHostContainer />)

    hooks.clear?.()
    expect(useNotificationsStore.getState().unreadCount).toBe(0)
  })
})
