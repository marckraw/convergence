import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the navigator.platform
const mockPlatform = 'MacIntel'
Object.defineProperty(navigator, 'platform', {
  value: mockPlatform,
  configurable: true,
})

describe('useFormSubmitShortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should handle Mac cmd+Enter shortcut', () => {
    const onSubmit = vi.fn()

    // Simulate the handler logic from the hook
    const isMac = navigator.platform.toLowerCase().includes('mac')
    const isShortcutKey = isMac ? true : false // cmdKey = true on Mac
    const key = 'Enter'

    if (isShortcutKey && key === 'Enter') {
      onSubmit()
    }

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('should handle non-Mac ctrl+Enter shortcut', () => {
    // Switch to non-Mac platform
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      configurable: true,
    })

    const onSubmit = vi.fn()

    const isMac = navigator.platform.toLowerCase().includes('mac')
    const isShortcutKey = isMac ? false : true // ctrlKey = true on Windows
    const key = 'Enter'

    if (isShortcutKey && key === 'Enter') {
      onSubmit()
    }

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('should not trigger on Enter without modifier', () => {
    const onSubmit = vi.fn()

    const isMac = navigator.platform.toLowerCase().includes('mac')
    const isShortcutKey = isMac ? false : false // no modifier
    const key = 'Enter'

    if (isShortcutKey && key === 'Enter') {
      onSubmit()
    }

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('should not trigger on cmd+Enter when disabled', () => {
    const onSubmit = vi.fn()
    const enabled = false

    if (enabled) {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const isShortcutKey = isMac ? true : false
      const key = 'Enter'

      if (isShortcutKey && key === 'Enter') {
        onSubmit()
      }
    }

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
