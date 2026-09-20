import { BrowserWindow, ipcMain } from 'electron'
import type { ContextDrillService } from './context-drill.service'
import type {
  DrillChange,
  DrillDescription,
  DrillOutcome,
} from './context-drill.types'

export const CONTEXT_DRILL_CHANGED_CHANNEL = 'contextDrill:changed'

export type ContextDrillBroadcastFn = (change: DrillChange) => void

export const broadcastContextDrillChange: ContextDrillBroadcastFn = (
  change,
) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(CONTEXT_DRILL_CHANGED_CHANNEL, change)
    }
  }
}

/**
 * The drill's three channels (MAR-3255 R6), the `registerRelayIpcHandlers`
 * pattern: thin handlers over a service that already knows everything.
 *
 * `run` answers with a VALUE on every ending, refusals included. An IPC
 * rejection crosses the boundary as a string the renderer would have to parse
 * to find out which beat stopped -- and "which beat" is the whole of what the
 * surface has to say next.
 */
export function registerContextDrillIpcHandlers(deps: {
  service: ContextDrillService
}): void {
  const { service } = deps

  ipcMain.handle(
    'contextDrill:run',
    (_event, sessionId: string): Promise<DrillOutcome> =>
      service.run(sessionId),
  )

  ipcMain.handle(
    'contextDrill:cancel',
    (_event, sessionId: string): { ok: true } | { ok: false; reason: string } =>
      service.cancel(sessionId),
  )

  ipcMain.handle(
    'contextDrill:describe',
    (_event, sessionId: string): DrillDescription =>
      service.describe(sessionId),
  )
}
