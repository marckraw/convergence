import type { WorkLedgerSnapshot } from './work-ledger.types'

/**
 * The work ledger, read-only (MAR-3084; moved here by MAR-3097 R7).
 *
 * Exactly two doors -- a read and a subscription. The panel never writes to
 * the tracker, so nothing that could is reachable from this object; a type
 * test pins its keys.
 */
export const workLedgerApi = {
  list: (crewId: string): Promise<WorkLedgerSnapshot> =>
    window.electronAPI.workLedger.list(crewId),
  onUpdated: (callback: (snapshot: WorkLedgerSnapshot) => void): (() => void) =>
    window.electronAPI.workLedger.onUpdated(callback),
}
