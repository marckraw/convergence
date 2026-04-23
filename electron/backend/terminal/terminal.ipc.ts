import { BrowserWindow, ipcMain } from 'electron'
import type { TerminalService } from './terminal.service'
import type { CreateTerminalInput } from './terminal.types'
import type { TerminalLayoutService } from './layout/terminal-layout.service'

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

export function registerTerminalLayoutIpcHandlers(
  service: TerminalLayoutService,
): void {
  ipcMain.handle('terminalLayout:get', (_event, sessionId: string) =>
    service.getLayout(sessionId),
  )

  ipcMain.handle(
    'terminalLayout:save',
    (_event, sessionId: string, tree: unknown) => {
      service.saveLayout(sessionId, tree)
    },
  )

  ipcMain.handle('terminalLayout:clear', (_event, sessionId: string) => {
    service.clearLayout(sessionId)
  })
}

export function broadcastToRenderers(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}
