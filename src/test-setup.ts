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
