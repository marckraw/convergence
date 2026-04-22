import type { WindowState } from './notifications.types'

export interface AttachableWindow {
  isFocused(): boolean
  isVisible(): boolean
  on(event: WindowLifecycleEvent, listener: () => void): void
  off?(event: WindowLifecycleEvent, listener: () => void): void
}

export type WindowLifecycleEvent =
  | 'focus'
  | 'blur'
  | 'show'
  | 'hide'
  | 'minimize'
  | 'restore'

export interface NotificationsStateListeners {
  onFocusGained?: () => void
}

export class NotificationsStateService {
  private isFocused = false
  private isVisible = false
  private activeSessionId: string | null = null
  private listeners: NotificationsStateListeners = {}

  attach(window: AttachableWindow): void {
    this.isFocused = window.isFocused()
    this.isVisible = window.isVisible()

    const refresh = () => {
      const wasFocused = this.isFocused
      this.isFocused = window.isFocused()
      this.isVisible = window.isVisible()
      if (!wasFocused && this.isFocused) {
        this.listeners.onFocusGained?.()
      }
    }

    window.on('focus', refresh)
    window.on('blur', refresh)
    window.on('show', refresh)
    window.on('hide', refresh)
    window.on('minimize', refresh)
    window.on('restore', refresh)
  }

  setListeners(listeners: NotificationsStateListeners): void {
    this.listeners = listeners
  }

  setActiveSession(sessionId: string | null): void {
    this.activeSessionId = sessionId
  }

  getState(): WindowState {
    return {
      isFocused: this.isFocused,
      isVisible: this.isVisible,
      activeSessionId: this.activeSessionId,
    }
  }
}
