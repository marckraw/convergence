import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The canary for the drill's preload bridge (MAR-3255 R6).
 *
 * `context-drill.ipc.test.ts` drives the handlers directly, so it would stay
 * green with the whole `contextDrill` block deleted from
 * `electron/preload/index.ts` -- and a channel the renderer cannot reach is a
 * button that does nothing. Silent absence, the class that let a mount vanish
 * with every suite green.
 *
 * So this test mounts the REAL preload module with `electron` stubbed, and
 * asserts the channels it invokes are exactly the channels the drill's IPC
 * module registers. Delete either side and the two lists stop agreeing.
 */
const hoisted = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
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
    on: hoisted.on,
    off: vi.fn(),
    once: vi.fn(),
    send: vi.fn(),
    removeListener: hoisted.removeListener,
    removeAllListeners: vi.fn(),
  },
  ipcMain: { handle: (channel: string) => registered.push(channel) },
  BrowserWindow: { getAllWindows: () => [] },
  nativeTheme: { prefersReducedTransparency: false },
}))

const registered: string[] = []

interface DrillBridge {
  run: (sessionId: string) => unknown
  describe: (sessionId: string) => unknown
  onChanged: (callback: (change: unknown) => void) => () => void
}

let bridge: DrillBridge

beforeEach(async () => {
  hoisted.invoke.mockReset()
  hoisted.invoke.mockResolvedValue(undefined)
  hoisted.on.mockReset()
  hoisted.removeListener.mockReset()
  registered.length = 0
  await import('../../preload/index')
  bridge = (hoisted.exposed.electronAPI as { contextDrill: DrillBridge })
    .contextDrill
})

describe('the contextDrill preload bridge (MAR-3255 R6)', () => {
  it('exposes the drill to the renderer at all', () => {
    expect(bridge).toBeDefined()
    expect(typeof bridge.run).toBe('function')
    expect(typeof bridge.describe).toBe('function')
    expect(typeof bridge.onChanged).toBe('function')
  })

  it('invokes the channels the main process registers, and passes the session', async () => {
    const { registerContextDrillIpcHandlers } =
      await import('./context-drill.ipc')
    registerContextDrillIpcHandlers({
      service: {
        run: vi.fn(),
        describe: vi.fn(),
      } as never,
    })

    await bridge.run('session-1')
    await bridge.describe('session-1')

    // The artifact on both sides: what the bridge asked for, and what the
    // main process is listening to. A rename on one side leaves this red.
    expect(hoisted.invoke.mock.calls).toEqual([
      ['contextDrill:run', 'session-1'],
      ['contextDrill:describe', 'session-1'],
    ])
    expect(registered).toEqual(['contextDrill:run', 'contextDrill:describe'])
  })

  it('subscribes and unsubscribes on the broadcast channel', async () => {
    const { CONTEXT_DRILL_CHANGED_CHANNEL } =
      await import('./context-drill.ipc')
    const seen: unknown[] = []
    const unsubscribe = bridge.onChanged((change) => seen.push(change))

    expect(hoisted.on).toHaveBeenCalledWith(
      CONTEXT_DRILL_CHANGED_CHANNEL,
      expect.any(Function),
    )
    const handler = hoisted.on.mock.calls.find(
      ([channel]) => channel === CONTEXT_DRILL_CHANGED_CHANNEL,
    )?.[1] as (event: unknown, change: unknown) => void
    handler(null, { sessionId: 's', beat: 'sealing' })
    // The event object is dropped and the payload is handed on: a callback
    // that received Electron's event would be reading the wrong argument.
    expect(seen).toEqual([{ sessionId: 's', beat: 'sealing' }])

    unsubscribe()
    expect(hoisted.removeListener).toHaveBeenCalledWith(
      CONTEXT_DRILL_CHANGED_CHANNEL,
      handler,
    )
  })
})
