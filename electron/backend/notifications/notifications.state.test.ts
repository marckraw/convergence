import { describe, expect, it } from 'vitest'
import {
  NotificationsStateService,
  type AttachableWindow,
  type WindowLifecycleEvent,
} from './notifications.state'

class FakeWindow implements AttachableWindow {
  focused: boolean
  visible: boolean
  private listeners = new Map<WindowLifecycleEvent, Set<() => void>>()

  constructor(focused: boolean, visible: boolean) {
    this.focused = focused
    this.visible = visible
  }

  isFocused(): boolean {
    return this.focused
  }

  isVisible(): boolean {
    return this.visible
  }

  on(event: WindowLifecycleEvent, listener: () => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(listener)
  }

  emit(event: WindowLifecycleEvent): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener()
    }
  }
}

describe('NotificationsStateService', () => {
  it('seeds initial focus + visibility from the attached window', () => {
    const state = new NotificationsStateService()
    state.attach(new FakeWindow(true, true))

    expect(state.getState()).toEqual({
      isFocused: true,
      isVisible: true,
      activeSessionId: null,
    })
  })

  it('updates focus/visibility on lifecycle events', () => {
    const state = new NotificationsStateService()
    const win = new FakeWindow(true, true)
    state.attach(win)

    win.focused = false
    win.emit('blur')
    expect(state.getState().isFocused).toBe(false)

    win.visible = false
    win.emit('hide')
    expect(state.getState().isVisible).toBe(false)

    win.focused = true
    win.visible = true
    win.emit('focus')
    win.emit('show')
    expect(state.getState()).toMatchObject({
      isFocused: true,
      isVisible: true,
    })
  })

  it('tracks the active session id independently of window events', () => {
    const state = new NotificationsStateService()
    state.attach(new FakeWindow(true, true))
    state.setActiveSession('session-7')

    expect(state.getState().activeSessionId).toBe('session-7')

    state.setActiveSession(null)
    expect(state.getState().activeSessionId).toBeNull()
  })
})
