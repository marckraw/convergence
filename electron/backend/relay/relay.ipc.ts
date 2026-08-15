import { BrowserWindow, ipcMain } from 'electron'
import type { RelayService } from './relay.service'
import type {
  CreateSessionRelayInput,
  RelayHop,
  SessionRelay,
  UpdateSessionRelayInput,
} from './relay.types'

export const RELAY_UPDATED_CHANNEL = 'relay:updated'
export const RELAY_HOP_APPENDED_CHANNEL = 'relayHop:appended'

export type RelayBroadcastFn = (relays: SessionRelay[]) => void
export type RelayHopBroadcastFn = (hop: RelayHop) => void

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
 * Every mutation answers the caller AND rebroadcasts the whole wire list, the
 * crew pattern: relays are cross-project furniture, and a second window must
 * never show an armed toggle for a wire this window just switched off.
 */
export function registerRelayIpcHandlers(deps: {
  service: RelayService
  broadcast?: RelayBroadcastFn
}): void {
  const { service } = deps
  const broadcast = deps.broadcast ?? broadcastRelays

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

  ipcMain.handle('relayHops:list', (_event, crewId: string, limit?: number) =>
    service.listHops(crewId, limit),
  )
}
