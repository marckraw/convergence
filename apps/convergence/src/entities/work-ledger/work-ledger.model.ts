import { create } from 'zustand'
import { workLedgerApi } from './work-ledger.api'
import type { WorkLedgerSnapshot } from './work-ledger.types'

interface WorkLedgerState {
  /** The last snapshot per crew, as the main process sent it. */
  snapshots: Record<string, WorkLedgerSnapshot>
  error: string | null
  unsubscribeBroadcast: (() => void) | null
}

interface WorkLedgerActions {
  /**
   * Reads each crew's snapshot and listens for later ones. Idempotent: the
   * subscription is made once, and a crew already read is read again (the
   * list is cheap and always fresh).
   */
  load: (crewIds: readonly string[]) => Promise<void>
}

export type WorkLedgerStore = WorkLedgerState & WorkLedgerActions

/**
 * The work ledger store (MAR-3097): what P2a's `workLedger:list` answered and
 * `workLedger:updated` sent, per crew. Holds facts only; every section and
 * label is derived in `features/waves`.
 */
export const useWorkLedgerStore = create<WorkLedgerStore>((set, get) => ({
  snapshots: {},
  error: null,
  unsubscribeBroadcast: null,

  load: async (crewIds) => {
    if (!get().unsubscribeBroadcast) {
      const unsubscribe = workLedgerApi.onUpdated((snapshot) => {
        set((state) => ({
          snapshots: { ...state.snapshots, [snapshot.crewId]: snapshot },
        }))
      })
      set({ unsubscribeBroadcast: unsubscribe })
    }
    try {
      const read = await Promise.all(
        crewIds.map((crewId) => workLedgerApi.list(crewId)),
      )
      set((state) => {
        const snapshots = { ...state.snapshots }
        for (const snapshot of read) snapshots[snapshot.crewId] = snapshot
        return { snapshots, error: null }
      })
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Could not read the ledger',
      })
    }
  },
}))
