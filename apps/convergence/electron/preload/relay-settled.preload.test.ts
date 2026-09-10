import { expect, it, vi } from 'vitest'
const wire = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  listeners: new Map<string, (...args: unknown[]) => void>(),
  sent: vi.fn(),
}))
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) =>
      wire.exposed.set(key, api),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: (channel: string, listener: (...args: unknown[]) => void) =>
      wire.listeners.set(channel, listener),
    removeListener: (channel: string) => wire.listeners.delete(channel),
  },
  ipcMain: { handle: vi.fn() },
  nativeTheme: { prefersReducedTransparency: false },
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, event: unknown) => {
            wire.sent(channel, event)
            wire.listeners.get(channel)?.({}, event)
          },
        },
      },
    ],
  },
}))
it('RUN66 round2 settlement crosses broadcast and preload with disposal — mutation misroute settled channel turns red', async () => {
  await import('./index')
  const { broadcastRelayHopSettled } =
    await import('../backend/relay/relay.ipc')
  const api = wire.exposed.get('electronAPI') as {
    relay: { onHopSettled: (cb: (event: unknown) => void) => () => void }
  }
  const callback = vi.fn()
  const off = api.relay.onHopSettled(callback)
  const event = { crewId: 'c1', hopIds: ['h1', 'h2'] }
  broadcastRelayHopSettled(event)
  off()
  broadcastRelayHopSettled(event)
  expect({
    calls: callback.mock.calls,
    channel: wire.sent.mock.calls[0]?.[0],
    listeners: wire.listeners.size,
  }).toEqual({ calls: [[event]], channel: 'relayHop:settled', listeners: 0 })
})
