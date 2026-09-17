import { BrowserWindow, ipcMain } from 'electron'
import type { WorkLedgerSnapshot } from './work-ledger.types'

export const WORK_LEDGER_UPDATED_CHANNEL = 'workLedger:updated'

export const broadcastWorkLedger = (snapshot: WorkLedgerSnapshot): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(WORK_LEDGER_UPDATED_CHANNEL, snapshot)
    }
  }
}

/** One read-only list; the watcher's broadcast carries the same shape. */
export function registerWorkLedgerIpcHandlers(deps: {
  snapshot: (crewId: string) => WorkLedgerSnapshot
}): void {
  ipcMain.handle('workLedger:list', (_event, crewId: string) =>
    deps.snapshot(crewId),
  )
}
