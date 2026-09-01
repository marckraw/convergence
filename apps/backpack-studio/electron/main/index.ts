import { app, BrowserWindow } from 'electron'
import { join } from 'path'

/**
 * Backpack Studio's shell — the second body's seed (MAR-2737).
 *
 * A window and nothing else. No database, no providers, no session runtime, no
 * daemon calls: this app exists at this stage to prove one thing, that the
 * monorepo floor can hold a second Electron app which consumes
 * `@convergence/execution-host-client` for real. What it becomes is its own
 * constitution's business (MAR-2705).
 */
function createWindow(): void {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
