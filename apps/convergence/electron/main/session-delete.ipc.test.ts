import { beforeEach, expect, it, vi } from 'vitest'
import { registerIpcHandlers } from './ipc'

vi.mock('../backend/pull-request/pull-request-refresh.service', () => ({
  connectPullRequestRefresh: vi.fn(),
}))
const handlers = new Map<string, (...args: unknown[]) => unknown>()
const send = vi.fn()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    on: vi.fn(),
  },
  dialog: {},
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send } }],
  },
  shell: {},
}))

const deleteSession = vi.fn()
const evictDeletedSessions = vi.fn()
const crews = {
  removeMembershipsForSession: vi.fn(() => 1),
  list: vi.fn(() => ['remaining crew']),
}
const relays = {
  removeForSession: vi.fn(() => 2),
  list: vi.fn(() => ['remaining wire']),
}

beforeEach(() => {
  vi.clearAllMocks()
  handlers.clear()
  deleteSession.mockReset()
  const args = Array.from({ length: 20 }, () => ({}))
  args[6] = { evictDeletedSessions }
  args[7] = {
    delete: deleteSession,
    setSummaryUpdateListener: vi.fn(),
    setEvidenceUpdateListener: vi.fn(),
    setConversationPatchListener: vi.fn(),
    setQueuedInputPatchListener: vi.fn(),
    setTurnDeltaListener: vi.fn(),
  }
  args[18] = crews
  args[19] = relays
  registerIpcHandlers(
    ...(args as unknown as Parameters<typeof registerIpcHandlers>),
  )
})

it('MAR-3254 R1 broadcasts the remaining wires and seats after deletion succeeds', () => {
  handlers.get('session:delete')!({}, 's1')
  expect(deleteSession).toHaveBeenCalledWith('s1')
  expect(relays.removeForSession).toHaveBeenCalledWith('s1')
  expect(crews.removeMembershipsForSession).toHaveBeenCalledWith('s1')
  expect(send.mock.calls).toEqual([
    ['relay:updated', ['remaining wire']],
    ['crew:updated', ['remaining crew']],
  ])
  expect(deleteSession.mock.invocationCallOrder[0]).toBeLessThan(
    relays.removeForSession.mock.invocationCallOrder[0],
  )
  expect(
    crews.removeMembershipsForSession.mock.invocationCallOrder[0],
  ).toBeLessThan(send.mock.invocationCallOrder[0])
  expect(evictDeletedSessions).toHaveBeenCalledOnce()
})

it('MAR-3254 R1 does not clean up or broadcast after a failed deletion', () => {
  deleteSession.mockImplementation(() => {
    throw new Error('delete failed')
  })
  expect(() => handlers.get('session:delete')!({}, 's1')).toThrow(
    'delete failed',
  )
  expect(relays.removeForSession).not.toHaveBeenCalled()
  expect(crews.removeMembershipsForSession).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
  expect(evictDeletedSessions).not.toHaveBeenCalled()
})
