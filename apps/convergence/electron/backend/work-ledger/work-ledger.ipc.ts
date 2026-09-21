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
  snapshot: (
    crewId: string,
  ) => Omit<WorkLedgerSnapshot, 'dispatchPlan'> &
    Partial<Pick<WorkLedgerSnapshot, 'dispatchPlan'>>
}): void {
  ipcMain.handle(
    'workLedger:list',
    (_event, crewId: string): WorkLedgerSnapshot => {
      const snapshot = deps.snapshot(crewId)
      return { ...snapshot, dispatchPlan: snapshot.dispatchPlan ?? null }
    },
  )
}
