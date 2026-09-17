import { ipcMain } from 'electron'
import type { TrackerCredentialStatus } from '../credentials/tracker-credentials.pure'
import type { TrackerProbeReading } from '../../../src/shared/types/tracker.types'
import type { TrackerProbe } from './tracker.types'

export interface TrackerIpcDeps {
  credentials: {
    status(crewId: string): Promise<TrackerCredentialStatus>
    setKey(crewId: string, apiKey: string): Promise<TrackerCredentialStatus>
    deleteKey(crewId: string): Promise<TrackerCredentialStatus>
  }
  probe: (crewId: string) => Promise<TrackerProbe>
  /** A key is only ever filed under a crew that exists (lap 2, F). */
  crewExists: (crewId: string) => boolean
  now?: () => Date
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
