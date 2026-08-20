import { BrowserWindow, ipcMain } from 'electron'
import type { ClearRelayHopsResult, RelayService } from './relay.service'
import type {
  CreateSessionRelayInput,
  RelayHop,
  SessionRelay,
  UpdateSessionRelayInput,
} from './relay.types'

export const RELAY_UPDATED_CHANNEL = 'relay:updated'
export const RELAY_HOP_APPENDED_CHANNEL = 'relayHop:appended'
export const RELAY_HOP_CLEARED_CHANNEL = 'relayHop:cleared'

export type RelayBroadcastFn = (relays: SessionRelay[]) => void
export type RelayHopBroadcastFn = (hop: RelayHop) => void
export type RelayHopClearedBroadcastFn = (crewId: string) => void

function sendToAllWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

export const broadcastRelays: RelayBroadcastFn = (relays) => {
  sendToAllWindows(RELAY_UPDATED_CHANNEL, relays)
}

export const broadcastRelayHop: RelayHopBroadcastFn = (hop) => {
  sendToAllWindows(RELAY_HOP_APPENDED_CHANNEL, hop)
}

/**
 * Says which crew's trail changed, not what is left of it. A window that is
 * not showing that crew ignores it, and one that is reloads the top of the
 * trail for itself -- which is also how it learns what a live run kept.
 */
export const broadcastRelayHopsCleared: RelayHopClearedBroadcastFn = (
  crewId,
) => {
  sendToAllWindows(RELAY_HOP_CLEARED_CHANNEL, crewId)
}

/**
 * Every mutation answers the caller AND rebroadcasts the whole wire list, the
 * crew pattern: relays are cross-project furniture, and a second window must
 * never show an armed toggle for a wire this window just switched off.
 */
export function registerRelayIpcHandlers(deps: {
  service: RelayService
  /**
   * The runs a clear must not touch. The engine owns this answer -- the loop
   * law reads the ledger, so emptying a live run's rows would tell a wire it
   * never fired -- and it is required rather than optional so no wiring can
   * produce a handler that clears without asking.
   */
  liveFlowRunIds: () => string[]
  broadcast?: RelayBroadcastFn
  broadcastCleared?: RelayHopClearedBroadcastFn
}): void {
  const { service, liveFlowRunIds } = deps
  const broadcast = deps.broadcast ?? broadcastRelays
  const broadcastCleared = deps.broadcastCleared ?? broadcastRelayHopsCleared

  const mutate = <T>(run: () => T): T => {
    const result = run()
    broadcast(service.list())
    return result
  }

  ipcMain.handle('relay:list', () => service.list())

  ipcMain.handle('relay:create', (_event, input: CreateSessionRelayInput) =>
    mutate(() => service.create(input)),
  )

  ipcMain.handle(
    'relay:update',
    (_event, id: string, patch: UpdateSessionRelayInput) =>
      mutate(() => service.update(id, patch)),
  )

  ipcMain.handle('relay:delete', (_event, id: string) => {
    mutate(() => service.delete(id))
  })

  ipcMain.handle('relay:arm', (_event, id: string) =>
    mutate(() => service.setArmed(id, true)),
  )

  ipcMain.handle('relay:disarm', (_event, id: string) =>
    mutate(() => service.setArmed(id, false)),
  )

  ipcMain.handle(
    'relayHops:list',
    (_event, crewId: string, limit?: number, beforeHopId?: string | null) =>
      service.listHops(crewId, limit, beforeHopId),
  )

  ipcMain.handle(
    'relayHops:clear',
    (_event, crewId: string): ClearRelayHopsResult => {
      const result = service.clearHops(crewId, {
        keepFlowRunIds: liveFlowRunIds(),
      })
      broadcastCleared(crewId)
      return result
    },
  )
}
