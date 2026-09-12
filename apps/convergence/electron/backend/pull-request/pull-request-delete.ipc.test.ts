import { beforeEach, expect, it, vi } from 'vitest'
import { registerIpcHandlers } from '../../main/ipc'

vi.mock('./pull-request-refresh.service', () => ({
  connectPullRequestRefresh: vi.fn(),
}))
const handlers = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    on: vi.fn(),
  },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: {},
  shell: {},
}))
beforeEach(() => handlers.clear())

it.each(['session', 'workspace', 'project'])(
  '%s deletion evicts PR readings afterward (mutation: omit deletion eviction)',
  async (kind) => {
    const calls: string[] = []
    const args = Array.from(
      { length: 18 },
      () => new Proxy({}, { get: () => vi.fn() }),
    )
    const deleteRow = vi.fn(() => {
      calls.push('deleted')
    })
    args[kind === 'session' ? 7 : kind === 'workspace' ? 3 : 0] = new Proxy(
      {},
      { get: (_target, key) => (key === 'delete' ? deleteRow : vi.fn()) },
    )
    args[6] = {
      evictDeletedSessions: () => {
        calls.push('evicted')
      },
    }
    ;(registerIpcHandlers as (...args: unknown[]) => void)(...args)
    await handlers.get(`${kind}:delete`)!({}, 'removed')
    expect(deleteRow).toHaveBeenCalledExactlyOnceWith('removed')
    expect(calls).toEqual(['deleted', 'evicted'])
  },
)
