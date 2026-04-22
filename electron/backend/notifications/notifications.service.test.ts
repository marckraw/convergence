import { beforeEach, describe, expect, it } from 'vitest'
import type { Session } from '../session/session.types'
import { DEFAULT_NOTIFICATION_PREFS } from './notifications.defaults'
import {
  NotificationsService,
  type NotificationDispatchPayload,
  type NotificationsServiceDeps,
} from './notifications.service'
import type {
  NotificationChannel,
  NotificationPrefs,
  WindowState,
} from './notifications.types'

const SESSION_ID = 'session-1'
const PROJECT_ID = 'project-1'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: SESSION_ID,
    projectId: PROJECT_ID,
    workspaceId: null,
    providerId: 'claude-code',
    model: 'sonnet',
    effort: 'medium',
    name: 'Refactor auth',
    status: 'running',
    attention: 'none',
    workingDirectory: '/tmp',
    contextWindow: null,
    activity: null,
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z',
    ...overrides,
  }
}

function makeWindowState(overrides: Partial<WindowState> = {}): WindowState {
  return {
    isFocused: false,
    isVisible: true,
    activeSessionId: null,
    ...overrides,
  }
}

interface Harness {
  service: NotificationsService
  dispatched: NotificationDispatchPayload[]
  channelsFor: (sessionId?: string) => NotificationChannel[]
  setPrefs: (prefs: NotificationPrefs) => void
  setWindowState: (state: WindowState) => void
}

function createHarness(
  initial: {
    prefs?: NotificationPrefs
    windowState?: WindowState
    projectName?: string | null
  } = {},
): Harness {
  let prefs = initial.prefs ?? DEFAULT_NOTIFICATION_PREFS
  let windowState = initial.windowState ?? makeWindowState()
  const projectName = initial.projectName ?? 'Convergence'
  const dispatched: NotificationDispatchPayload[] = []

  const deps: NotificationsServiceDeps = {
    getPrefs: () => prefs,
    getWindowState: () => windowState,
    getProjectName: () => projectName,
    dispatch: (payload) => dispatched.push(payload),
    now: () => 1_000,
  }

  return {
    service: new NotificationsService(deps),
    dispatched,
    channelsFor: (sessionId = SESSION_ID) =>
      dispatched
        .filter((p) => p.event.sessionId === sessionId)
        .map((p) => p.channel),
    setPrefs: (next) => {
      prefs = next
    },
    setWindowState: (next) => {
      windowState = next
    },
  }
}

describe('NotificationsService.onAttentionTransition', () => {
  let harness: Harness

  beforeEach(() => {
    harness = createHarness()
  })

  it('fires on the first real attention transition', () => {
    harness.service.onAttentionTransition('none', 'finished', makeSession())
    expect(harness.dispatched.length).toBeGreaterThan(0)
    expect(harness.dispatched[0].event.kind).toBe('agent.finished')
  })

  it('fires agent.finished when next becomes finished', () => {
    const session = makeSession()
    harness.service.onAttentionTransition('none', 'finished', session)

    expect(harness.dispatched.length).toBeGreaterThan(0)
    for (const payload of harness.dispatched) {
      expect(payload.event.kind).toBe('agent.finished')
      expect(payload.event.sessionId).toBe(SESSION_ID)
      expect(payload.formatted.title).toBe('Refactor auth finished')
    }
  })

  it('fires agent.needs_input when needs-approval → needs-input', () => {
    const session = makeSession()
    harness.service.onAttentionTransition(
      'needs-approval',
      'needs-input',
      session,
    )

    expect(harness.dispatched.length).toBeGreaterThan(0)
    expect(harness.dispatched[0].event.kind).toBe('agent.needs_input')
  })

  it('fires nothing when next is none (resolution)', () => {
    const session = makeSession()
    harness.service.onAttentionTransition('none', 'finished', session)
    harness.dispatched.length = 0
    harness.service.onAttentionTransition('finished', 'none', session)

    expect(harness.dispatched).toEqual([])
  })

  it('fires nothing when prev === next', () => {
    const session = makeSession()
    harness.service.onAttentionTransition('none', 'finished', session)
    harness.dispatched.length = 0
    harness.service.onAttentionTransition('finished', 'finished', session)

    expect(harness.dispatched).toEqual([])
  })

  it('dispatches the channels chosen by the policy', () => {
    const harnessUnfocused = createHarness({
      windowState: makeWindowState({ isFocused: false }),
    })
    const session = makeSession()
    harnessUnfocused.service.onAttentionTransition(
      'none',
      'needs-input',
      session,
    )

    expect([...harnessUnfocused.channelsFor()].sort()).toEqual([
      'dock-badge',
      'dock-bounce-crit',
      'flash-frame',
      'sound-alert',
      'system-notification',
      'toast',
    ])
  })

  it('respects the master enabled=false toggle', () => {
    harness.setPrefs({ ...DEFAULT_NOTIFICATION_PREFS, enabled: false })
    const session = makeSession()
    harness.service.onAttentionTransition('none', 'finished', session)

    expect(harness.dispatched).toEqual([])
  })

  it('falls back to "Convergence" when project name is unknown', () => {
    const harnessNoProject = createHarness({ projectName: null })
    const session = makeSession()
    harnessNoProject.service.onAttentionTransition('none', 'finished', session)

    expect(harnessNoProject.dispatched[0].event.projectName).toBe('Convergence')
  })

  it('tracks per-session transitions independently', () => {
    const sessionA = makeSession({ id: 'session-A', name: 'A' })
    const sessionB = makeSession({ id: 'session-B', name: 'B' })

    harness.service.onAttentionTransition('none', 'finished', sessionB)
    harness.service.onAttentionTransition('none', 'finished', sessionA)
    expect(harness.channelsFor('session-A').sort()).toEqual([
      'dock-badge',
      'dock-bounce-info',
      'sound-soft',
      'system-notification',
      'toast',
    ])
    expect(harness.channelsFor('session-B').sort()).toEqual([
      'dock-badge',
      'dock-bounce-info',
      'sound-soft',
      'system-notification',
      'toast',
    ])
  })

  it('forgetSession does not suppress future real transitions', () => {
    const session = makeSession()
    harness.service.forgetSession(session.id)
    harness.service.onAttentionTransition('none', 'finished', session)

    expect(harness.dispatched.length).toBeGreaterThan(0)
  })
})

describe('NotificationsService.fire', () => {
  it('bypass ignores prefs.enabled=false and window focus state', () => {
    const harness = createHarness({
      prefs: { ...DEFAULT_NOTIFICATION_PREFS, enabled: false },
      windowState: makeWindowState({
        isFocused: true,
        isVisible: true,
        activeSessionId: SESSION_ID,
      }),
    })
    const event = harness.service.buildEvent(
      'agent.finished',
      makeSession({ name: 'Soft test' }),
    )

    harness.service.fire(event, { bypass: true })

    expect([...harness.channelsFor()].sort()).toEqual([
      'dock-badge',
      'dock-bounce-info',
      'sound-soft',
      'system-notification',
      'toast',
    ])
  })

  it('bypass escalates to critical-severity channels for errored events', () => {
    const harness = createHarness()
    const event = harness.service.buildEvent(
      'agent.errored',
      makeSession({ name: 'Alert test' }),
    )

    harness.service.fire(event, { bypass: true })

    expect([...harness.channelsFor()].sort()).toEqual([
      'dock-badge',
      'dock-bounce-crit',
      'flash-frame',
      'sound-alert',
      'system-notification',
      'toast',
    ])
  })

  it('non-bypass fire still respects prefs.enabled=false', () => {
    const harness = createHarness({
      prefs: { ...DEFAULT_NOTIFICATION_PREFS, enabled: false },
    })
    const event = harness.service.buildEvent('agent.finished', makeSession())

    harness.service.fire(event)

    expect(harness.dispatched).toEqual([])
  })
})
