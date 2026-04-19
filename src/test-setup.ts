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
