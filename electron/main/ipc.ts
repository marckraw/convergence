import { ipcMain, dialog, BrowserWindow } from 'electron'
import { ProjectService } from '../backend/project/project.service'
import { StateService } from '../backend/state/state.service'
import type { CreateProjectInput } from '../backend/project/project.types'

const ACTIVE_PROJECT_KEY = 'active_project_id'

export function registerIpcHandlers(
  projectService: ProjectService,
  stateService: StateService,
): void {
  ipcMain.handle('project:create', (_event, input: CreateProjectInput) => {
    const project = projectService.create(input)
    stateService.set(ACTIVE_PROJECT_KEY, project.id)
    return project
  })

  ipcMain.handle('project:getAll', () => {
    return projectService.getAll()
  })

  ipcMain.handle('project:getById', (_event, id: string) => {
    return projectService.getById(id)
  })

  ipcMain.handle('project:delete', (_event, id: string) => {
    const activeId = stateService.get(ACTIVE_PROJECT_KEY)
    projectService.delete(id)
    if (activeId === id) {
      stateService.delete(ACTIVE_PROJECT_KEY)
    }
  })

  ipcMain.handle('project:getActive', () => {
    const activeId = stateService.get(ACTIVE_PROJECT_KEY)
    if (!activeId) return null
    return projectService.getById(activeId)
  })

  ipcMain.handle('project:setActive', (_event, id: string) => {
    const project = projectService.getById(id)
    if (!project) throw new Error(`Project not found: ${id}`)
    stateService.set(ACTIVE_PROJECT_KEY, id)
  })

  ipcMain.handle('dialog:selectDirectory', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'Select a Git Repository',
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
