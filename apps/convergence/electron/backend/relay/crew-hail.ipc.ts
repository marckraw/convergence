import { BrowserWindow, ipcMain } from 'electron'
import type { CrewHailService } from './crew-hail.service'
import type { CrewHail } from './crew-hail.types'

export const CREW_HAILS_UPDATED_CHANNEL = 'crewHails:updated'

export type CrewHailBroadcastFn = (hails: CrewHail[]) => void

function sendToAllWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

/**
 * Sends the whole open list rather than the one that changed.
 *
 * A hail is an alarm, and an alarm that a second window did not hear about is
 * the silence this feature exists to remove. The list is short by construction
 * -- it is what a human still owes an answer to.
 */
export const broadcastCrewHails: CrewHailBroadcastFn = (hails) => {
  sendToAllWindows(CREW_HAILS_UPDATED_CHANNEL, hails)
}

/**
 * Every mutation answers the caller AND rebroadcasts the open list, the crew
 * pattern: acknowledging a hail in one window must clear the amber frame in
 * every other one.
 */
export function registerCrewHailIpcHandlers(deps: {
  service: CrewHailService
  broadcast?: CrewHailBroadcastFn
}): void {
  const { service } = deps
  const broadcast = deps.broadcast ?? broadcastCrewHails

  ipcMain.handle('crewHails:listOpen', () => service.listOpen())

  ipcMain.handle('crewHails:acknowledge', (_event, id: string) => {
    service.acknowledge(id)
    broadcast(service.listOpen())
  })

  ipcMain.handle('crewHails:acknowledgeCrew', (_event, crewId: string) => {
    const answered = service.acknowledgeCrew(crewId)
    broadcast(service.listOpen())
    return answered
  })
}
