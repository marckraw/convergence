import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// The jsdom shims the primitives need, as the app's own unit setup has them
// (apps/convergence/src/test-setup.ts). Radix's popper measures with
// ResizeObserver, which jsdom does not implement.
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

// jsdom does not implement Element.scrollIntoView; a ListboxOption calls it
// when it becomes the active row, and Base UI's lists when they highlight one.
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

afterEach(async () => {
  cleanup()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
})
