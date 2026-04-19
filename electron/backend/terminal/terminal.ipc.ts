import { BrowserWindow, ipcMain } from 'electron'
import type { TerminalService } from './terminal.service'
import type { CreateTerminalInput } from './terminal.types'

export function registerTerminalIpcHandlers(service: TerminalService): void {
  ipcMain.handle('terminal:create', (_event, input: CreateTerminalInput) =>
    service.create(input),
  )

  ipcMain.handle('terminal:attach', (_event, id: string) => service.attach(id))

  ipcMain.handle('terminal:write', (_event, id: string, data: string) => {
    service.write(id, data)
  })

  ipcMain.handle(
    'terminal:resize',
    (_event, id: string, cols: number, rows: number) => {
      service.resize(id, cols, rows)
    },
  )

  ipcMain.handle('terminal:dispose', (_event, id: string) => {
    service.dispose(id)
  })

  ipcMain.handle('terminal:getForegroundProcess', (_event, id: string) =>
    service.getForegroundProcess(id),
  )
}

export function broadcastToRenderers(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}
