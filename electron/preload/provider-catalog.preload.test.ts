import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The preload half of `provider:getAll` (MAR-2682).
 *
 * One line, and the only line in the slice no other gate can see. The renderer
 * suites stub `window.electronAPI` and the main suites call the handler
 * directly, so a preload that quietly stopped forwarding which machine was
 * asked about would leave every one of them green while the composer showed
 * this laptop's providers under a daemon's name — the exact contradiction S3
 * exists to end, reintroduced at the one seam nothing was watching.
 *
 * `contextBridge.exposeInMainWorld` takes `any`, so the shared
 * `ElectronAPI` declaration does not constrain this file either. Hence a test.
 */

const exposed = new Map<string, Record<string, unknown>>()
const invoke = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: Record<string, unknown>) => {
      exposed.set(key, api)
    },
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => invoke(...args),
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
  nativeTheme: { prefersReducedTransparency: false },
}))

async function providerBridge(): Promise<{
  getAll: (executionHostId?: string | null) => unknown
}> {
  await import('./index')
  const api = exposed.get('electronAPI')
  expect(api).toBeDefined()
  return (api as { provider: { getAll: (id?: string | null) => unknown } })
    .provider
}

describe('the provider bridge', () => {
  beforeEach(() => {
    invoke.mockClear()
  })

  it('forwards the machine it was asked about', async () => {
    const provider = await providerBridge()
    provider.getAll('daemon-b')
    expect(invoke).toHaveBeenCalledWith('provider:getAll', 'daemon-b')
  })

  it('says "this machine" explicitly rather than sending nothing', async () => {
    // `null` and "no argument at all" both mean local on the far side, but only
    // one of them survives a handler that later reads a positional argument by
    // index. Sending the value keeps the wire self-describing.
    const provider = await providerBridge()
    provider.getAll()
    expect(invoke).toHaveBeenCalledWith('provider:getAll', null)
  })
})
