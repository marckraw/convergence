// PR observer lifecycle is exercised by pull-request-refresh.service.test.ts.
vi.mock('../backend/pull-request/pull-request-refresh.service', () => ({
  connectPullRequestRefresh: vi.fn(),
}))

import { expect, it, vi } from 'vitest'
import { registerIpcHandlers } from './ipc'
const handlers = new Map<string, (...args: unknown[]) => unknown>()
const send = vi.fn()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (key: string, fn: (...args: unknown[]) => unknown) =>
      handlers.set(key, fn),
    on: vi.fn(),
  },
  dialog: {},
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send } }],
  },
  shell: {},
}))
it('R3 reads the projection and broadcasts on the existing evidence callback — mutations drop IPC read or harness broadcast turn red', () => {
  let flush: ((event: { sessionId: string }) => void) | undefined
  const read = vi.fn(() => ({ compactions: ['record'] })),
    noop = () => {}
  const args = Array.from({ length: 18 }, () => ({}) as never)
  args[7] = {
    harnessFacts: read,
    setSummaryUpdateListener: noop,
    setEvidenceUpdateListener: (listener: typeof flush) => {
      flush = listener
    },
    setConversationPatchListener: noop,
    setQueuedInputPatchListener: noop,
    setTurnDeltaListener: noop,
  } as never
  ;(registerIpcHandlers as (...values: never[]) => void)(...args)
  const facts = handlers.get('session:harnessFacts')?.({}, 'session')
  flush?.({ sessionId: 'session' })
  expect({ facts, read: read.mock.calls, sent: send.mock.calls }).toEqual({
    facts: { compactions: ['record'] },
    read: [['session']],
    sent: [
      ['session:evidenceUpdated', { sessionId: 'session' }],
      ['harness.facts', { sessionId: 'session' }],
    ],
  })
})
