import { beforeEach, describe, expect, it, vi } from 'vitest'
import { codexSpeedApi } from './codex-speed.api'

/**
 * The canary for the speed-tier bridge (MAR-3574), built like MAR-2550's.
 *
 * The composer test mocks `window.electronAPI.codexSpeed`, so with the preload
 * line deleted every other suite stays green while the choice silently shows
 * Standard only. This loads the real preload with `electron` stubbed and
 * drives the real `codexSpeedApi`: remove the line and it dies on a missing
 * function; rename the channel and it dies on the assertion.
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

describe('the codexSpeed:list preload bridge (MAR-3574)', () => {
  beforeEach(async () => {
    hoisted.invoke.mockReset()
    hoisted.invoke.mockResolvedValue({
      status: 'available',
      checkedAt: '2026-10-01T00:00:00.000Z',
      models: {},
    })
    await import('../../../electron/preload/index')
    Object.defineProperty(window, 'electronAPI', {
      value: hoisted.exposed.electronAPI,
      configurable: true,
      writable: true,
    })
  })

  it('carries a scoped ask from the api to the real ipc channel', async () => {
    const scope = { executionHostId: 'local', providerAccountId: 'icloud' }
    await codexSpeedApi.list(false, scope)
    expect(hoisted.invoke).toHaveBeenCalledWith('codexSpeed:list', false, scope)
  })
})
