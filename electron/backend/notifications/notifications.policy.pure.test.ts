import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFICATION_PREFS } from './notifications.defaults'
import {
  decideChannels,
  eventSeverity,
  formatTitleAndBody,
  MAX_BODY_LENGTH,
} from './notifications.policy.pure'
import type {
  NotificationEvent,
  NotificationEventKind,
  NotificationPrefs,
  WindowState,
} from './notifications.types'

const SESSION_ID = 'session-1'
const OTHER_SESSION_ID = 'session-2'

function makeEvent(kind: NotificationEventKind): NotificationEvent {
  return {
    id: 'event-1',
    kind,
    sessionId: SESSION_ID,
    sessionName: 'Refactor auth',
    projectName: 'Convergence',
    firedAt: 1_000,
  }
}

function makeWindowState(overrides: Partial<WindowState> = {}): WindowState {
  return {
    isFocused: true,
    isVisible: true,
    activeSessionId: SESSION_ID,
    ...overrides,
  }
}

function withPrefs(overrides: Partial<NotificationPrefs>): NotificationPrefs {
  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...overrides,
    events: {
      ...DEFAULT_NOTIFICATION_PREFS.events,
      ...(overrides.events ?? {}),
    },
  }
}

describe('eventSeverity', () => {
  it('maps finished to info', () => {
    expect(eventSeverity('agent.finished')).toBe('info')
  })

  it.each([
    'agent.needs_input',
    'agent.needs_approval',
    'agent.errored',
  ] as const)('maps %s to critical', (kind) => {
    expect(eventSeverity(kind)).toBe('critical')
  })
})

describe('decideChannels — window state matrix', () => {
  describe('focused + visible + this-session', () => {
    const windowState = makeWindowState()

    it('fires only inline-pulse for info events', () => {
      const channels = decideChannels(
        makeEvent('agent.finished'),
        windowState,
        DEFAULT_NOTIFICATION_PREFS,
      )
      expect([...channels].sort()).toEqual(['inline-pulse'])
    })

    it('fires only inline-pulse for critical events', () => {
      const channels = decideChannels(
        makeEvent('agent.needs_input'),
        windowState,
        DEFAULT_NOTIFICATION_PREFS,
      )
      expect([...channels].sort()).toEqual(['inline-pulse'])
    })
  })

  describe('focused + visible + other session', () => {
    const windowState = makeWindowState({ activeSessionId: OTHER_SESSION_ID })

    it('fires toast + soft sound + dock-badge for info', () => {
      const channels = decideChannels(
        makeEvent('agent.finished'),
        windowState,
        DEFAULT_NOTIFICATION_PREFS,
      )
      expect([...channels].sort()).toEqual([
        'dock-badge',
        'sound-soft',
        'toast',
      ])
    })

    it('uses soft sound for critical too while focused', () => {
      const channels = decideChannels(
        makeEvent('agent.errored'),
        windowState,
        DEFAULT_NOTIFICATION_PREFS,
      )
      expect([...channels].sort()).toEqual([
        'dock-badge',
        'sound-soft',
        'toast',
      ])
    })

    it('does not fire system / bounce / flash while focused', () => {
      const channels = decideChannels(
        makeEvent('agent.errored'),
        windowState,
        DEFAULT_NOTIFICATION_PREFS,
      )
      expect(channels.has('system-notification')).toBe(false)
      expect(channels.has('dock-bounce-info')).toBe(false)
      expect(channels.has('dock-bounce-crit')).toBe(false)
      expect(channels.has('flash-frame')).toBe(false)
    })
  })

  describe('focused + not visible', () => {
    const windowState = makeWindowState({
      isVisible: false,
      activeSessionId: OTHER_SESSION_ID,
    })

    it('still treats as in-app: toast + soft sound + badge, no OS surfaces', () => {
      const channels = decideChannels(
        makeEvent('agent.finished'),
        windowState,
        DEFAULT_NOTIFICATION_PREFS,
      )
      expect([...channels].sort()).toEqual([
        'dock-badge',
        'sound-soft',
        'toast',
      ])
    })
  })

  describe('not focused + visible', () => {
    const windowState = makeWindowState({ isFocused: false })

    it('fires full set for info: toast + soft + badge + system + info-bounce', () => {
      const channels = decideChannels(
        makeEvent('agent.finished'),
        windowState,
        DEFAULT_NOTIFICATION_PREFS,
      )
      expect([...channels].sort()).toEqual([
        'dock-badge',
        'dock-bounce-info',
        'sound-soft',
        'system-notification',
        'toast',
      ])
    })

    it('fires full set for critical including alert sound + crit-bounce + flash', () => {
      const channels = decideChannels(
        makeEvent('agent.needs_input'),
        windowState,
        DEFAULT_NOTIFICATION_PREFS,
      )
      expect([...channels].sort()).toEqual([
        'dock-badge',
        'dock-bounce-crit',
        'flash-frame',
        'sound-alert',
        'system-notification',
        'toast',
      ])
    })

    it('inline-pulse never fires when window is unfocused, even for active session', () => {
      const channels = decideChannels(
        makeEvent('agent.finished'),
        windowState,
        DEFAULT_NOTIFICATION_PREFS,
      )
      expect(channels.has('inline-pulse')).toBe(false)
    })
  })

  describe('not focused + not visible', () => {
    const windowState = makeWindowState({
      isFocused: false,
      isVisible: false,
    })

    it('fires the same OS surfaces as not-focused-visible', () => {
      const channels = decideChannels(
        makeEvent('agent.errored'),
        windowState,
        DEFAULT_NOTIFICATION_PREFS,
      )
      expect([...channels].sort()).toEqual([
        'dock-badge',
        'dock-bounce-crit',
        'flash-frame',
        'sound-alert',
        'system-notification',
        'toast',
      ])
    })
  })
})

describe('decideChannels — preferences masking', () => {
  const unfocused = makeWindowState({ isFocused: false })

  it('master enabled=false produces an empty set', () => {
    const channels = decideChannels(
      makeEvent('agent.errored'),
      unfocused,
      withPrefs({ enabled: false }),
    )
    expect(channels.size).toBe(0)
  })

  it('per-event toggle off produces an empty set for that event only', () => {
    const finishedOff = withPrefs({
      events: { ...DEFAULT_NOTIFICATION_PREFS.events, finished: false },
    })
    expect(
      decideChannels(makeEvent('agent.finished'), unfocused, finishedOff).size,
    ).toBe(0)
    // Other events still fire normally.
    expect(
      decideChannels(makeEvent('agent.errored'), unfocused, finishedOff).size,
    ).toBeGreaterThan(0)
  })

  it.each([
    [
      'toasts',
      { toasts: false } as Partial<NotificationPrefs>,
      'toast' as const,
    ],
    [
      'system',
      { system: false } as Partial<NotificationPrefs>,
      'system-notification' as const,
    ],
    [
      'dockBadge',
      { dockBadge: false } as Partial<NotificationPrefs>,
      'dock-badge' as const,
    ],
  ])('per-channel toggle %s removes that channel only', (_, prefsPatch, ch) => {
    const channels = decideChannels(
      makeEvent('agent.errored'),
      unfocused,
      withPrefs(prefsPatch),
    )
    expect(channels.has(ch)).toBe(false)
    // Other channels still present.
    expect(channels.has('toast') || channels.has('system-notification')).toBe(
      true,
    )
  })

  it('sounds=false removes both soft and alert variants', () => {
    const channels = decideChannels(
      makeEvent('agent.errored'),
      unfocused,
      withPrefs({ sounds: false }),
    )
    expect(channels.has('sound-soft')).toBe(false)
    expect(channels.has('sound-alert')).toBe(false)
  })

  it('dockBounce=false removes both info and crit variants', () => {
    const channels = decideChannels(
      makeEvent('agent.errored'),
      unfocused,
      withPrefs({ dockBounce: false }),
    )
    expect(channels.has('dock-bounce-info')).toBe(false)
    expect(channels.has('dock-bounce-crit')).toBe(false)
  })

  it('suppressWhenFocused=false adds toast + sound + badge to focused-this-session', () => {
    const channels = decideChannels(
      makeEvent('agent.finished'),
      makeWindowState(),
      withPrefs({ suppressWhenFocused: false }),
    )
    expect([...channels].sort()).toEqual([
      'dock-badge',
      'inline-pulse',
      'sound-soft',
      'toast',
    ])
  })

  it('suppressWhenFocused=false does not unlock OS surfaces', () => {
    const channels = decideChannels(
      makeEvent('agent.errored'),
      makeWindowState(),
      withPrefs({ suppressWhenFocused: false }),
    )
    expect(channels.has('system-notification')).toBe(false)
    expect(channels.has('dock-bounce-crit')).toBe(false)
    expect(channels.has('flash-frame')).toBe(false)
  })
})

describe('formatTitleAndBody', () => {
  it('produces a kind-specific title and uses project name as body', () => {
    expect(formatTitleAndBody(makeEvent('agent.finished'))).toEqual({
      title: 'Refactor auth finished',
      body: 'Convergence',
    })
    expect(formatTitleAndBody(makeEvent('agent.needs_input'))).toEqual({
      title: 'Refactor auth needs input',
      body: 'Convergence',
    })
    expect(formatTitleAndBody(makeEvent('agent.needs_approval'))).toEqual({
      title: 'Refactor auth needs approval',
      body: 'Convergence',
    })
    expect(formatTitleAndBody(makeEvent('agent.errored'))).toEqual({
      title: 'Refactor auth errored',
      body: 'Convergence',
    })
  })

  it('truncates long bodies to MAX_BODY_LENGTH with an ellipsis', () => {
    const long = 'x'.repeat(MAX_BODY_LENGTH + 50)
    const event: NotificationEvent = {
      ...makeEvent('agent.finished'),
      projectName: long,
    }
    const formatted = formatTitleAndBody(event)
    expect(formatted.body.length).toBe(MAX_BODY_LENGTH)
    expect(formatted.body.endsWith('…')).toBe(true)
  })
})
