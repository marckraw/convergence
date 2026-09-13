import { dialog, ipcMain } from 'electron'
import { broadcastCrews } from './crew.ipc'
import type { CrewService } from './crew.service'
import type {
  CrewExportOptions,
  CrewExportService,
} from './crew-export.service'

export function registerCrewExportIpc(
  service: CrewExportService,
  crews: CrewService,
): void {
  ipcMain.handle(
    'crew:export',
    async (_event, crewId: string, options: CrewExportOptions = {}) => {
      const result = await service.export(
        crewId,
        options,
        async (defaultPath) => {
          const answer = await dialog.showSaveDialog({
            title: 'Export crew',
            defaultPath,
            filters: [{ name: 'Crew YAML', extensions: ['yaml', 'yml'] }],
            properties: [
              'createDirectory',
              'showHiddenFiles',
              'showOverwriteConfirmation',
            ],
          })
          return answer.canceled ? null : (answer.filePath ?? null)
        },
        async (projects) => {
          const answer = await dialog.showMessageBox({
            type: 'question',
            message: 'Choose the crew’s home project',
            detail:
              'The crew has no single project with the most members. Where should its YAML be saved?',
            buttons: ['Cancel', ...projects.map((p) => p.name)],
            cancelId: 0,
            defaultId: 0,
          })
          return projects[answer.response - 1]?.id ?? null
        },
      )
      if (result) broadcastCrews(crews.list())
      return result
    },
  )
}
