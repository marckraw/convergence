import { BrowserWindow, ipcMain } from 'electron'
import type { TrackerCredentialStatus } from '../credentials/tracker-credentials.pure'
import type {
  TrackerOutsideSnapshot,
  TrackerProbeReading,
  TrackerProjectResolution,
  TrackerReadEvent,
  TrackerRefreshReply,
} from '../../../src/shared/types/tracker.types'
import type { TrackerProbe } from './tracker.types'

export interface TrackerIpcDeps {
  credentials: {
    status(crewId: string): Promise<TrackerCredentialStatus>
    setKey(crewId: string, apiKey: string): Promise<TrackerCredentialStatus>
    deleteKey(crewId: string): Promise<TrackerCredentialStatus>
  }
  probe: (crewId: string) => Promise<TrackerProbe>
  /** Finds the project a person named, by URL, name or id (MAR-3156). */
  resolveProject: (
    crewId: string,
    reference: string,
  ) => Promise<TrackerProjectResolution>
  /** A key is only ever filed under a crew that exists (lap 2, F). */
  crewExists: (crewId: string) => boolean
  /** Asks for a read of the crew's tracker now, subject to the floor (MAR-3227). */
  refresh: (crewId: string) => TrackerRefreshReply
  /**
   * The crew's open issues outside the loop, as last read (MAR-3236). From
   * the watcher's memory: answering never asks the tracker anything.
   */
  outside: (crewId: string) => TrackerOutsideSnapshot
  now?: () => Date
}

export const TRACKER_READ_CHANNEL = 'tracker:read'
export const TRACKER_OUTSIDE_UPDATED_CHANNEL = 'tracker:outsideUpdated'

/** Tells every window a crew's tracker was just read (MAR-3227 R6). */
export const broadcastTrackerRead = (event: TrackerReadEvent): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(TRACKER_READ_CHANNEL, event)
  }
}

/** Tells every window a crew's outside read replaced its snapshot (MAR-3236). */
export const broadcastTrackerOutside = (
  snapshot: TrackerOutsideSnapshot,
): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(TRACKER_OUTSIDE_UPDATED_CHANNEL, snapshot)
    }
  }
}

/**
 * The tracker's doors (MAR-3084 R8). Every one reads the tracker or the
 * Keychain's presence bit; none writes to the tracker, and none returns a key.
 */
export function registerTrackerIpcHandlers(deps: TrackerIpcDeps): void {
  const now = deps.now ?? (() => new Date())

  ipcMain.handle(
    'tracker:probe',
    async (_event, crewId: string): Promise<TrackerProbeReading> => ({
      probe: await deps.probe(crewId),
      at: now().toISOString(),
    }),
  )

  // A read like the probe (MAR-3156 R5): a crew id and what was typed go in,
  // projects come back. The key is fetched behind this door and never crosses
  // it in either direction.
  ipcMain.handle(
    'tracker:resolveProject',
    (_event, crewId: string, reference: string) =>
      deps.resolveProject(crewId, reference),
  )

  // A read, asked for sooner (MAR-3227 R6): it moves nothing on the tracker,
  // and it never reads a crew that is backing off or inside the floor.
  ipcMain.handle('tracker:refresh', (_event, crewId: string) =>
    deps.refresh(crewId),
  )

  // A read of what the watcher already holds (MAR-3236): the issues outside
  // the loop, from memory. It asks the tracker nothing and carries no key.
  ipcMain.handle('tracker:outside', (_event, crewId: string) =>
    deps.outside(crewId),
  )

  ipcMain.handle('tracker:credentialStatus', (_event, crewId: string) =>
    deps.credentials.status(crewId),
  )

  // Answers the presence bit only: the key goes in and never comes back out.
  ipcMain.handle(
    'tracker:setCredential',
    async (_event, crewId: string, apiKey: string) => {
      if (typeof crewId !== 'string' || !deps.crewExists(crewId)) {
        throw new Error(
          'A tracker key can only be stored for an existing crew.',
        )
      }
      return deps.credentials.setKey(crewId, apiKey)
    },
  )

  ipcMain.handle('tracker:deleteCredential', (_event, crewId: string) =>
    deps.credentials.deleteKey(crewId),
  )
}
