import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { getDatabase } from '../backend/database/database'
import { ProjectService } from '../backend/project/project.service'
import { StateService } from '../backend/state/state.service'
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
  const db = getDatabase(dbPath)
  const projectService = new ProjectService(db)
  const stateService = new StateService(db)

  registerIpcHandlers(projectService, stateService)

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
