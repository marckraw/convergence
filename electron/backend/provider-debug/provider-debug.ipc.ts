import { BrowserWindow, ipcMain } from 'electron'
import type {
  BroadcastFn,
  ProviderDebugService,
} from './provider-debug.service'

export const broadcastProviderDebug: BroadcastFn = (channel, payload) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

export function registerProviderDebugIpcHandlers(
  service: ProviderDebugService,
): void {
  ipcMain.handle('provider:debug:list', (_event, sessionId: string) =>
    service.list(sessionId),
  )
}
