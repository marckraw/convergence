import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { autoUpdater } from 'electron-updater'
import { updateChannels } from '../../shared/updates.types'
import { createStudioUpdater } from './updates.service'

export function registerStudioUpdates() {
  // electron-updater reads app-update.yml generated from Studio's builder publish block.
  // Development and browser property checks never contact the release feed.
  const updater = app.isPackaged
    ? createStudioUpdater(autoUpdater, (state) => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.webContents.isDestroyed())
            window.webContents.send(updateChannels.state, state)
        }
      })
    : undefined
  const owned = (event: IpcMainInvokeEvent) => {
    if (
      event.senderFrame !== event.sender.mainFrame ||
      !BrowserWindow.fromWebContents(event.sender)
    ) {
      throw new Error('Studio updates require the app window')
    }
  }
  ipcMain.handle(updateChannels.get, (event) => {
    owned(event)
    return updater?.getState() ?? { status: 'idle' }
  })
  ipcMain.handle(updateChannels.check, (event) => {
    owned(event)
    return updater?.check()
  })
  ipcMain.handle(updateChannels.download, (event) => {
    owned(event)
    return updater?.download()
  })
  ipcMain.handle(updateChannels.install, (event) => {
    owned(event)
    updater?.install()
  })
  app.once('will-quit', () => {
    updater?.dispose()
    for (const channel of [
      updateChannels.get,
      updateChannels.check,
      updateChannels.download,
      updateChannels.install,
    ])
      ipcMain.removeHandler(channel)
  })
}
