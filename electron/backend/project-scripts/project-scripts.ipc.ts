import { BrowserWindow, ipcMain } from 'electron'
import type { ProjectScriptsRunner } from './project-scripts.runner'
import type { ProjectScriptsService } from './project-scripts.service'
import type {
  CreateProjectScriptInput,
  UpdateProjectScriptInput,
} from './project-scripts.types'

export function registerProjectScriptsIpcHandlers(
  service: ProjectScriptsService,
  runner: ProjectScriptsRunner,
): void {
  ipcMain.handle('projectScripts:list', (_event, projectId: string) =>
    service.listByProjectId(projectId),
  )

  ipcMain.handle(
    'projectScripts:create',
    (_event, input: CreateProjectScriptInput) => service.create(input),
  )

  ipcMain.handle(
    'projectScripts:update',
    (_event, id: string, input: UpdateProjectScriptInput) =>
      service.update(id, input),
  )

  ipcMain.handle('projectScripts:delete', (_event, id: string) => {
    service.delete(id)
  })

  ipcMain.handle('projectScripts:listRuns', (_event, projectId: string) =>
    service.listRunsByProjectId(projectId),
  )

  ipcMain.handle('projectScripts:listActiveRuns', () =>
    service.listActiveRuns(),
  )

  ipcMain.handle('projectScripts:getRun', (_event, runId: string) =>
    service.getRun(runId),
  )

  ipcMain.handle('projectScripts:run', (_event, scriptId: string) =>
    runner.run(scriptId),
  )

  ipcMain.handle('projectScripts:stop', (_event, runId: string) =>
    runner.stop(runId),
  )
}

export function broadcastProjectScriptRun(
  channel: string,
  payload: unknown,
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}
