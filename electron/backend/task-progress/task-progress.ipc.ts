import { BrowserWindow } from 'electron'
import type { BroadcastFn } from './task-progress.service'

export const broadcastTaskProgress: BroadcastFn = (channel, payload) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}
