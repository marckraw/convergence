import { dialog, ipcMain } from 'electron'
import type {
  CrewExportOptions,
  CrewExportService,
} from './crew-export.service'

export function registerCrewExportIpc(service: CrewExportService): void {
  ipcMain.handle(
    'crew:export',
    (_event, crewId: string, options: CrewExportOptions = {}) =>
      service.export(crewId, options, async (projects) => {
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
      }),
  )
}
