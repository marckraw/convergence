import type {
  TrackerReadEvent,
  TrackerRefreshReply,
} from '@/shared/types/tracker.types'

/**
 * Loom's two tracker doors (MAR-3227 R6): ask for a read sooner, and hear
 * every read that happened.
 *
 * Here rather than on `workLedgerApi`, which is the LEDGER read-only and
 * pins exactly its two doors (MAR-3097 R7). Neither of these writes anything
 * -- a refresh only asks the watcher to read now, and inside the floor it
 * asks nothing at all.
 */
export const trackerRefreshApi = {
  refresh: (crewId: string): Promise<TrackerRefreshReply> =>
    window.electronAPI.tracker.refresh(crewId),
  /**
   * A preload without the door (a stubbed one) means no pushes, never a
   * crash: the control then counts from the snapshot's `lastOkAt` alone.
   */
  onRead: (callback: (event: TrackerReadEvent) => void): (() => void) =>
    window.electronAPI.tracker?.onRead?.(callback) ?? (() => {}),
}
