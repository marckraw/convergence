import type { CreateTerminalArgs } from './terminal.types'

export const terminalApi = {
  create(input: CreateTerminalArgs) {
    return window.electronAPI.terminal.create(input)
  },
  attach(id: string) {
    return window.electronAPI.terminal.attach(id)
  },
  write(id: string, data: string) {
    return window.electronAPI.terminal.write(id, data)
  },
  resize(id: string, cols: number, rows: number) {
    return window.electronAPI.terminal.resize(id, cols, rows)
  },
  dispose(id: string) {
    return window.electronAPI.terminal.dispose(id)
  },
  onData(id: string, callback: (data: string) => void) {
    return window.electronAPI.terminal.onData(id, callback)
  },
  onExit(
    id: string,
    callback: (payload: { exitCode: number; signal: number | null }) => void,
  ) {
    return window.electronAPI.terminal.onExit(id, callback)
  },
}
