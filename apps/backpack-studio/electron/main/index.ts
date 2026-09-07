import { resolveStudioWindowSize } from './window-options.config'
import { registerStudioUpdates } from '../updates/updates.ipc'
import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'

function createWindow(): void {
  const window = new BrowserWindow({
    ...resolveStudioWindowSize(screen.getPrimaryDisplay().workAreaSize),
    title: 'Backpack Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerStudioUpdates()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
