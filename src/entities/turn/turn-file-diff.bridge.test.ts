import { beforeEach, describe, expect, it, vi } from 'vitest'
import { turnsApi } from './turn.api'

/**
 * The canary for the `turns:getFileDiff` preload bridge (MAR-2589).
 *
 * `turn.api.test.ts` proves the renderer's half against a mocked
 * `window.electronAPI`, so it would stay green with the repository argument
 * deleted from `electron/preload/index.ts` — and a bridge that forwards only
 * the turn and the path answers with whichever repository's row the database
 * finds first. Silent absence, the class that let F11 vanish from the session
 * header with every suite green.
 *
 * So this test does not mock the bridge. It loads the real preload module with
 * `electron` itself stubbed, installs the object it exposes as
 * `window.electronAPI`, and drives the real `turnsApi` through it. Drop the
 * argument from the preload and this dies on the assertion.
 */

const hoisted = vi.hoisted(() => ({
  invoke: vi.fn(),
  exposed: {} as Record<string, unknown>,
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => {
      hoisted.exposed[key] = api
    },
  },
  ipcRenderer: {
    invoke: hoisted.invoke,
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    send: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  nativeTheme: { prefersReducedTransparency: false },
}))

describe('the turns:getFileDiff preload bridge (MAR-2589)', () => {
  beforeEach(async () => {
    hoisted.invoke.mockReset()
    hoisted.invoke.mockResolvedValue('')
    await import('../../../electron/preload/index')
    Object.defineProperty(window, 'electronAPI', {
      value: hoisted.exposed.electronAPI,
      configurable: true,
      writable: true,
    })
  })

  it('is actually exposed on the bridge the preload builds', () => {
    const api = hoisted.exposed.electronAPI as {
      turns: Record<string, unknown>
    }
    expect(typeof api.turns.getFileDiff).toBe('function')
  })

  it('carries the repository a diff belongs to onto the real ipc channel', async () => {
    hoisted.invoke.mockResolvedValue('api readme diff')

    const diff = await turnsApi.getFileDiff('turn-1', 'README.md', 'apps/api')

    expect(hoisted.invoke).toHaveBeenCalledWith(
      'turns:getFileDiff',
      'turn-1',
      'README.md',
      'apps/api',
    )
    expect(diff).toBe('api readme diff')
  })

  it('carries the working-directory root as null rather than as nothing', async () => {
    // null and undefined mean different things to the main process: null is
    // "the root repository", undefined is "by turn and path alone".
    await turnsApi.getFileDiff('turn-1', 'README.md', null)

    expect(hoisted.invoke).toHaveBeenCalledWith(
      'turns:getFileDiff',
      'turn-1',
      'README.md',
      null,
    )
  })
})
