import { create } from 'zustand'
import type { ConnectionPath } from './connections-overview.pure'

/** One account's row in the connections overview (MAR-3518). */
export interface ConnectionsOverviewRow {
  accountId: string
  provider: 'OpenAI' | 'Claude'
  identity: string
  state: 'checking' | 'checked' | 'not-connected' | 'failed'
  paths: ConnectionPath[]
  /** A check's own error, shown beside what it could still read. */
  error: string | null
}

/**
 * The last "Check all accounts", kept in a store so it outlives the Settings
 * section like the panel's sign-in memory does. Only the latest run may
 * write, so a slow older run never overwrites a newer one.
 */
interface ConnectionsOverviewState {
  rows: ConnectionsOverviewRow[]
  checkedAt: string | null
  running: number | null
  begin: (rows: ConnectionsOverviewRow[]) => number
  update: (run: number, row: ConnectionsOverviewRow) => void
  finish: (run: number, checkedAt: string) => void
}

let runs = 0

export const useConnectionsOverviewStore = create<ConnectionsOverviewState>(
  (set, get) => ({
    rows: [],
    checkedAt: null,
    running: null,
    begin: (rows) => {
      const run = ++runs
      set({ rows, running: run })
      return run
    },
    update: (run, row) => {
      if (get().running !== run) return
      set((state) => ({
        rows: state.rows.map((entry) =>
          entry.accountId === row.accountId ? row : entry,
        ),
      }))
    },
    finish: (run, checkedAt) => {
      if (get().running !== run) return
      set({ checkedAt, running: null })
    },
  }),
)
