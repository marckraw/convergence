import { BrowserWindow, ipcMain } from 'electron'
import type { CrewService } from './crew.service'
import type {
  CreateSessionCrewInput,
  SessionCrew,
  UpdateSessionCrewInput,
} from './crew.types'

export const CREW_UPDATED_CHANNEL = 'crew:updated'

export type CrewBroadcastFn = (crews: SessionCrew[]) => void

export const broadcastCrews: CrewBroadcastFn = (crews) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(CREW_UPDATED_CHANNEL, crews)
    }
  }
}

/**
 * Every mutation answers the caller AND broadcasts the whole crew list to all
 * windows: crews are cross-project furniture, so a second Mission Control
 * window must never hold a stale roster.
 */
export function registerCrewIpcHandlers(deps: {
  service: CrewService
  broadcast?: CrewBroadcastFn
}): void {
  const { service } = deps
  const broadcast = deps.broadcast ?? broadcastCrews

  const mutate = <T>(run: () => T): T => {
    const result = run()
    broadcast(service.list())
    return result
  }

  ipcMain.handle('crew:list', () => service.list())

  ipcMain.handle('crew:create', (_event, input: CreateSessionCrewInput) =>
    mutate(() => service.create(input)),
  )

  ipcMain.handle(
    'crew:update',
    (_event, id: string, patch: UpdateSessionCrewInput) =>
      mutate(() => service.update(id, patch)),
  )

  ipcMain.handle('crew:delete', (_event, id: string) => {
    mutate(() => service.delete(id))
  })

  ipcMain.handle(
    'crew:addMember',
    (_event, crewId: string, sessionId: string) =>
      mutate(() => service.addMember(crewId, sessionId)),
  )

  ipcMain.handle(
    'crew:removeMember',
    (_event, crewId: string, sessionId: string) =>
      mutate(() => service.removeMember(crewId, sessionId)),
  )
}
