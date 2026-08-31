import { ipcMain } from 'electron'
import type { ProjectOpenService } from './project-open.service'
import type { ProjectOpenRequest } from './project-open.types'

export function registerProjectOpenIpcHandlers(
  service: ProjectOpenService,
): void {
  ipcMain.handle('projectOpen:listApps', () => service.listApps())
  ipcMain.handle('projectOpen:open', (_event, input: ProjectOpenRequest) =>
    service.open(input),
  )
}
