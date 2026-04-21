import type { App } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { applyDockIcon, shouldQuitOnWindowAllClosed } from './app-chrome.darwin'

function makeApp(): { app: App; setIcon: ReturnType<typeof vi.fn> } {
  const setIcon = vi.fn()
  const app = { dock: { setIcon } } as unknown as App
  return { app, setIcon }
}

describe('app-chrome.darwin', () => {
  it('sets the dock icon when an icon path is provided', () => {
    const { app, setIcon } = makeApp()
    applyDockIcon(app, '/tmp/icon.icns')
    expect(setIcon).toHaveBeenCalledWith('/tmp/icon.icns')
  })

  it('skips the dock icon when icon path is null', () => {
    const { app, setIcon } = makeApp()
    applyDockIcon(app, null)
    expect(setIcon).not.toHaveBeenCalled()
  })

  it('tolerates an app with no dock (e.g. during teardown)', () => {
    const app = {} as unknown as App
    expect(() => applyDockIcon(app, '/tmp/icon.icns')).not.toThrow()
  })

  it('keeps the app running when all windows close', () => {
    expect(shouldQuitOnWindowAllClosed()).toBe(false)
  })
})
