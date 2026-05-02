import { BrowserWindow, ipcMain, shell } from 'electron'
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

export interface ProviderDebugIpcDeps {
  service: ProviderDebugService
  logsDirectory: string | null
}

export function registerProviderDebugIpcHandlers(
  deps: ProviderDebugService | ProviderDebugIpcDeps,
): void {
  const service = 'service' in deps ? deps.service : deps
  const logsDirectory = 'service' in deps ? deps.logsDirectory : null

  ipcMain.handle('provider:debug:list', (_event, sessionId: string) =>
    service.list(sessionId),
  )

  ipcMain.handle('provider:debug:openFolder', () => {
    if (!logsDirectory) return false
    void shell.openPath(logsDirectory)
    return true
  })
}
