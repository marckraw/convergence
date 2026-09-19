import type { TrackerOutsideSnapshot } from '@/shared/types/tracker.types'

/**
 * Loom's two doors to the issues outside the loop (MAR-3236): the crew's
 * last outside read, and every read that replaced it.
 *
 * Here rather than on `workLedgerApi`, which is the LEDGER and pins exactly
 * its two doors: these issues are beside the ledger, never in it. Neither
 * door writes anything, and neither asks the tracker -- the watcher's memory
 * answers.
 *
 * A preload without the doors (a stubbed one) means "never read", never a
 * crash.
 */
export const loomOutsideApi = {
  read: (crewId: string): Promise<TrackerOutsideSnapshot | null> =>
    window.electronAPI.tracker?.outside?.(crewId) ?? Promise.resolve(null),
  onUpdated: (
    callback: (snapshot: TrackerOutsideSnapshot) => void,
  ): (() => void) =>
    window.electronAPI.tracker?.onOutsideUpdated?.(callback) ?? (() => {}),
}
