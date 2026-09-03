import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The preload half of the lane doors (MAR-2783, slice L1).
 *
 * The renderer suites stub `window.electronAPI` and the main suite calls the
 * handlers directly, so a bridge that forwarded `lane.create` to the wrong
 * channel -- or dropped the progress subscription -- would leave every one of
 * them green while the dialog never left "Starting…". Pinned here, because
 * `exposeInMainWorld` takes `any` and the shared declaration constrains
 * nothing in this file.
 */

const exposed = new Map<string, Record<string, unknown>>()
const invoke = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: Record<string, unknown>) => {
      exposed.set(key, api)
    },
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => invoke(...args),
    on: (...args: unknown[]) => on(...args),
    removeListener: (...args: unknown[]) => removeListener(...args),
    send: vi.fn(),
  },
  nativeTheme: { prefersReducedTransparency: false },
}))

async function laneBridge(): Promise<Record<string, unknown>> {
  await import('./index')
  const api = exposed.get('electronAPI')
  expect(api).toBeDefined()
  return (api as Record<string, Record<string, unknown>>).lane
}

describe('the lane bridge', () => {
  beforeEach(() => {
    invoke.mockClear()
    on.mockClear()
    removeListener.mockClear()
  })

  it('forwards a creation whole', async () => {
    const lane = await laneBridge()
    const input = { rootProjectId: 'root', laneName: 'studio', branchName: 'b' }
    ;(lane.create as (input: unknown) => unknown)(input)
    expect(invoke).toHaveBeenCalledWith('lane:create', input)
  })

  it('lists by root and reveals by project', async () => {
    const lane = await laneBridge()
    ;(lane.list as (id: string) => unknown)('root')
    ;(lane.reveal as (id: string) => unknown)('lane-1')
    expect(invoke).toHaveBeenCalledWith('lane:list', 'root')
    expect(invoke).toHaveBeenCalledWith('lane:reveal', 'lane-1')
  })

  it('subscribes to progress and unsubscribes the same listener', async () => {
    const lane = await laneBridge()
    const callback = vi.fn()
    const unsubscribe = (
      lane.onProgress as (cb: (p: unknown) => void) => () => void
    )(callback)

    expect(on).toHaveBeenCalledWith('lane:progress', expect.any(Function))
    const handler = on.mock.calls[0]![1] as (
      event: unknown,
      payload: unknown,
    ) => void
    handler({}, { rootProjectId: 'root', laneName: 'studio', phase: 'copying' })
    expect(callback).toHaveBeenCalledWith({
      rootProjectId: 'root',
      laneName: 'studio',
      phase: 'copying',
    })

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith('lane:progress', handler)
  })
})
