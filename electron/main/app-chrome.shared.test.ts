import type { App } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { applyDockIcon, shouldQuitOnWindowAllClosed } from './app-chrome.shared'

describe('app-chrome.shared (non-darwin default)', () => {
  it('is a no-op for dock icon (no dock to apply to)', () => {
    const setIcon = vi.fn()
    const app = { dock: { setIcon } } as unknown as App
    applyDockIcon(app, '/tmp/icon.ico')
    expect(setIcon).not.toHaveBeenCalled()
  })

  it('quits the app when all windows close', () => {
    expect(shouldQuitOnWindowAllClosed()).toBe(true)
  })
})
