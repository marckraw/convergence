import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { CrewImportService } from './crew-import.service'
import type { CrewService } from './crew.service'
import type { CrewImportDecisions } from './crew-import.types'
import type { RelayService } from '../relay/relay.service'
import { broadcastRelays } from '../relay/relay.ipc'
import { broadcastCrews } from './crew.ipc'

export function registerCrewImportIpc(
  service: CrewImportService,
  crews: CrewService,
  relays: RelayService,
): void {
  ipcMain.handle(
    'crew:importPlan',
    async (event, path?: string, choices: Record<string, string> = {}) => {
      if (path === undefined) {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) return null
        const result = await dialog.showOpenDialog(window, {
          properties: ['openFile'],
          filters: [{ name: 'Crew YAML', extensions: ['yaml', 'yml'] }],
        })
        if (result.canceled || !result.filePaths[0]) return null
        path = result.filePaths[0]
      }
      return service.plan(path, choices)
    },
  )
  ipcMain.handle(
    'crew:importApply',
    async (_event, path: string, decisions: CrewImportDecisions) => {
      const report = await service.apply(path, decisions)
      broadcastCrews(crews.list())
      broadcastRelays(relays.list())
      return report
    },
  )
}
