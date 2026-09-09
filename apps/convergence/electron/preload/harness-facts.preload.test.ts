import { expect, it, vi } from 'vitest'
const exposed = new Map<string, unknown>(),
  invoke = vi.fn(),
  on = vi.fn(),
  remove = vi.fn()
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => exposed.set(key, api),
  },
  ipcRenderer: { invoke, on, removeListener: remove, send: vi.fn() },
  nativeTheme: { prefersReducedTransparency: false },
}))
it('R3 forwards the harness read and event with disposal — mutation misroute bridge turns red', async () => {
  await import('./index')
  const api = (
      exposed.get('electronAPI') as {
        session: {
          harnessFacts: (id: string) => unknown
          onHarnessFacts: (
            callback: (event: { sessionId: string }) => void,
          ) => () => void
        }
      }
    ).session,
    callback = vi.fn()
  api.harnessFacts('s')
  const off = api.onHarnessFacts(callback),
    handler = on.mock.calls.find((call) => call[0] === 'harness.facts')?.[1]
  handler?.({}, { sessionId: 's' })
  off()
  expect({
    read: invoke.mock.calls,
    channel: on.mock.calls.map((call) => call[0]),
    payload: callback.mock.calls,
    removed: remove.mock.calls,
  }).toEqual({
    read: [['session:harnessFacts', 's']],
    channel: ['harness.facts'],
    payload: [[{ sessionId: 's' }]],
    removed: [['harness.facts', handler]],
  })
})
