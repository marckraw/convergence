import { BrowserWindow, ipcMain } from 'electron'
import type { CrewService } from './crew.service'
import type {
  CreateCrewRecipeSeatInput,
  CrewMemberRef,
  UpdateCrewSeatInput,
} from './crew.service'
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

  // What a seat IS (MAR-3083 R1/R6): its own door, like the baton name's.
  // Every member-scoped write names the member the same way, so a recipe --
  // which has no session id -- is editable and removable like any other seat.
  ipcMain.handle(
    'crew:setMemberSeat',
    (
      _event,
      crewId: string,
      member: CrewMemberRef,
      patch: UpdateCrewSeatInput,
    ) => mutate(() => service.setMemberSeat(crewId, member, patch)),
  )

  // A seat that is a recipe rather than a conversation (MAR-3083 R3).
  ipcMain.handle(
    'crew:addRecipeMember',
    (_event, crewId: string, input: CreateCrewRecipeSeatInput) =>
      mutate(() => service.addRecipeMember(crewId, input)),
  )

  ipcMain.handle(
    'crew:addMember',
    (_event, crewId: string, sessionId: string) =>
      mutate(() => service.addMember(crewId, sessionId)),
  )

  ipcMain.handle(
    'crew:removeMember',
    (_event, crewId: string, member: CrewMemberRef) =>
      mutate(() => service.removeMember(crewId, member)),
  )

  ipcMain.handle(
    'crew:setMemberBatonName',
    (_event, crewId: string, member: CrewMemberRef, batonName: string | null) =>
      mutate(() => service.setMemberBatonName(crewId, member, batonName)),
  )

  // Where a card was dropped (R10). A mutation like every other in this file,
  // so a second window showing the same crew moves the card too.
  ipcMain.handle(
    'crew:setMemberPosition',
    (
      _event,
      crewId: string,
      sessionId: string,
      position: { x: number; y: number } | null,
    ) => mutate(() => service.setMemberPosition(crewId, sessionId, position)),
  )
}
