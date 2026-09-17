import { create } from 'zustand'
import { workLedgerApi } from './work-ledger.api'
import type { WorkLedgerSnapshot } from './work-ledger.types'

interface WorkLedgerStoreState {
  /** The last snapshot per crew, as the main process sent it. */
  snapshots: Record<string, WorkLedgerSnapshot>
  /**
   * How many broadcasts each crew has received (lap 2, C). A `list` answer is
   * kept only if no broadcast for its crew landed after it was asked for.
   */
  broadcastCount: Record<string, number>
  error: string | null
  unsubscribeBroadcast: (() => void) | null
}

interface WorkLedgerActions {
  /**
   * Reads each crew's snapshot and listens for later ones. The subscription
   * is made once; a read never overwrites a broadcast newer than the read.
   */
  load: (crewIds: readonly string[]) => Promise<void>
}

export type WorkLedgerStore = WorkLedgerStoreState & WorkLedgerActions

/**
 * The work ledger store (MAR-3097): what P2a's `workLedger:list` answered and
 * `workLedger:updated` sent, per crew. Holds facts only; every section and
 * label is derived in `features/waves`.
 */
export const useWorkLedgerStore = create<WorkLedgerStore>((set, get) => ({
  snapshots: {},
  broadcastCount: {},
  error: null,
  unsubscribeBroadcast: null,

  load: async (crewIds) => {
    if (!get().unsubscribeBroadcast) {
      const unsubscribe = workLedgerApi.onUpdated((snapshot) => {
        set((state) => ({
          snapshots: { ...state.snapshots, [snapshot.crewId]: snapshot },
          broadcastCount: {
            ...state.broadcastCount,
            [snapshot.crewId]: (state.broadcastCount[snapshot.crewId] ?? 0) + 1,
          },
        }))
      })
      set({ unsubscribeBroadcast: unsubscribe })
    }
    // What each crew had received when the read was asked for.
    const askedAt = Object.fromEntries(
      crewIds.map((crewId) => [crewId, get().broadcastCount[crewId] ?? 0]),
    )
    try {
      const read = await Promise.all(
        crewIds.map((crewId) => workLedgerApi.list(crewId)),
      )
      set((state) => {
        const snapshots = { ...state.snapshots }
        for (const snapshot of read) {
          const since = state.broadcastCount[snapshot.crewId] ?? 0
          // A broadcast landed after this read was asked for: it is newer.
          if (since !== askedAt[snapshot.crewId]) continue
          snapshots[snapshot.crewId] = snapshot
        }
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
