import { BrowserWindow, ipcMain } from 'electron'
import type { LocalModelTunnelService } from './local-model-tunnel.service'
import type { LocalModelTunnelProfileInput } from './local-model-tunnel.types'

export function registerLocalModelTunnelIpcHandlers(
  service: LocalModelTunnelService,
): void {
  ipcMain.handle('localModelTunnel:getSnapshot', () => service.getSnapshot())
  ipcMain.handle('localModelTunnel:start', (_event, profileId: string) =>
    service.start(profileId),
  )
  ipcMain.handle('localModelTunnel:stop', (_event, profileId: string) =>
    service.stop(profileId),
  )
  ipcMain.handle('localModelTunnel:restart', (_event, profileId: string) =>
    service.restart(profileId),
  )
  ipcMain.handle(
    'localModelTunnel:createProfile',
    (_event, input: LocalModelTunnelProfileInput) =>
      service.createProfile(input),
  )
  ipcMain.handle(
    'localModelTunnel:updateProfile',
    (_event, profileId: string, input: LocalModelTunnelProfileInput) =>
      service.updateProfile(profileId, input),
  )
  ipcMain.handle(
    'localModelTunnel:deleteProfile',
    (_event, profileId: string) => service.deleteProfile(profileId),
  )
}

export function broadcastLocalModelTunnelSnapshot(snapshot: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('localModelTunnel:changed', snapshot)
    }
  }
}
