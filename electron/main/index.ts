import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { getDatabase } from '../backend/database/database'
import { ProjectService } from '../backend/project/project.service'
import { StateService } from '../backend/state/state.service'
import { WorkspaceService } from '../backend/workspace/workspace.service'
import { GitService } from '../backend/git/git.service'
import { SessionService } from '../backend/session/session.service'
import { ProviderRegistry } from '../backend/provider/provider-registry'
import { FakeProvider } from '../backend/provider/fake-provider'
import { registerIpcHandlers } from './ipc'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Convergence',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const dbPath = join(app.getPath('userData'), 'convergence.db')
  const workspacesRoot = join(app.getPath('userData'), 'workspaces')
  const db = getDatabase(dbPath)

  const gitService = new GitService()
  const projectService = new ProjectService(db)
  const stateService = new StateService(db)
  const workspaceService = new WorkspaceService(db, gitService, workspacesRoot)
  const providerRegistry = new ProviderRegistry()
  const sessionService = new SessionService(db, providerRegistry)

  projectService.setWorkspaceService(workspaceService)
  providerRegistry.register(new FakeProvider())

  registerIpcHandlers(
    projectService,
    stateService,
    workspaceService,
    gitService,
    sessionService,
    providerRegistry,
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
