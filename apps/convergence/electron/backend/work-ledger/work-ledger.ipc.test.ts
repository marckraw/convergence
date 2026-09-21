import { beforeEach, expect, it, vi } from 'vitest'
import type { DispatchPlan } from '../../../src/shared/types/tracker.types'
const mocks = vi.hoisted(() => ({ handle: vi.fn() }))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  BrowserWindow: { getAllWindows: () => [] },
}))
import { registerWorkLedgerIpcHandlers } from './work-ledger.ipc'
beforeEach(() => mocks.handle.mockClear())
it('R7 list always carries null before planning and the cached plan afterward, on the existing channel', () => {
  let plan: DispatchPlan | null = null
  registerWorkLedgerIpcHandlers({
    snapshot: (crewId) => ({
      crewId,
      entries: [],
      trackerHealth: null,
      dispatchPlan: plan,
    }),
  })
  const [channel, read] = mocks.handle.mock.calls[0]
  expect(channel).toBe('workLedger:list')
  expect(read(null, 'crew').dispatchPlan).toBeNull()
  plan = {
    plannedAt: '2026-09-21T12:00:00Z',
    words: {},
    order: {},
    warnings: [],
  }
  expect(read(null, 'crew').dispatchPlan).toBe(plan)
})
it('R7 the list boundary supplies null for a reader without a planner', () => {
  registerWorkLedgerIpcHandlers({
    snapshot: (crewId) => ({ crewId, entries: [], trackerHealth: null }),
  })
  expect(mocks.handle.mock.calls[0][1](null, 'crew')).toEqual({
    crewId: 'crew',
    entries: [],
    trackerHealth: null,
    dispatchPlan: null,
  })
})
