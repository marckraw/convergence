import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom does not implement ResizeObserver; react-resizable-panels expects it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(
    globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }
  ).ResizeObserver = MockResizeObserver
}

// jsdom does not implement Element.scrollIntoView; cmdk calls it when the
// highlighted item changes.
if (
  typeof Element !== 'undefined' &&
  typeof Element.prototype.scrollIntoView !== 'function'
) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

// Radix FocusScope dispatches CustomEvent instances. In Vitest/jsdom, the
// Node globals can differ from window event constructors, causing dispatchEvent
// to reject the event after async focus timers fire.
if (
  typeof window !== 'undefined' &&
  typeof window.Event !== 'undefined' &&
  globalThis.Event !== window.Event
) {
  Object.defineProperty(globalThis, 'Event', {
    value: window.Event,
    configurable: true,
    writable: true,
  })
}

if (
  typeof window !== 'undefined' &&
  typeof window.CustomEvent !== 'undefined' &&
  globalThis.CustomEvent !== window.CustomEvent
) {
  Object.defineProperty(globalThis, 'CustomEvent', {
    value: window.CustomEvent,
    configurable: true,
    writable: true,
  })
}

// TanStack Router calls scrollTo during route commits. jsdom's implementation
// reports "not implemented", and route tests only need the navigation state
// change.
if (typeof window !== 'undefined') {
  window.scrollTo = function scrollTo() {}
}

// Pin navigator.platform so shortcut tests exercise the mac branch by default.
if (typeof navigator !== 'undefined') {
  try {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    })
  } catch {
    // some environments freeze navigator; safe to ignore
  }
}

afterEach(() => {
  cleanup()
})
