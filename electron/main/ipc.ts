import { ipcMain, dialog, BrowserWindow } from 'electron'
import { ProjectService } from '../backend/project/project.service'
import { StateService } from '../backend/state/state.service'
import { WorkspaceService } from '../backend/workspace/workspace.service'
import { GitService } from '../backend/git/git.service'
import type { CreateProjectInput } from '../backend/project/project.types'
import type { CreateWorkspaceInput } from '../backend/workspace/workspace.types'

const ACTIVE_PROJECT_KEY = 'active_project_id'

export function registerIpcHandlers(
  projectService: ProjectService,
  stateService: StateService,
  workspaceService: WorkspaceService,
  gitService: GitService,
): void {
  // Project handlers
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

  ipcMain.handle('project:delete', async (_event, id: string) => {
    const activeId = stateService.get(ACTIVE_PROJECT_KEY)
    await projectService.delete(id)
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

  // Dialog handlers
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

  // Workspace handlers
  ipcMain.handle(
    'workspace:create',
    async (_event, input: CreateWorkspaceInput) => {
      return workspaceService.create(input)
    },
  )

  ipcMain.handle('workspace:getByProjectId', (_event, projectId: string) => {
    return workspaceService.getByProjectId(projectId)
  })

  ipcMain.handle('workspace:delete', async (_event, id: string) => {
    await workspaceService.delete(id)
  })

  // Git handlers
  ipcMain.handle('git:getBranches', async (_event, repoPath: string) => {
    return gitService.getBranches(repoPath)
  })

  ipcMain.handle('git:getCurrentBranch', async (_event, repoPath: string) => {
    return gitService.getCurrentBranch(repoPath)
  })
}
