import { afterEach, expect, it, vi } from 'vitest'
import { app, BrowserWindow, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { registerAgentMeterIpc } from './agent-meter.ipc'
import { MeterProcessSource } from './process-source'

vi.mock('electron', () => ({
  app: { getAppMetrics: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn() },
  ipcMain: { handle: vi.fn() },
}))
vi.mock('child_process', () => ({ execFile: vi.fn() }))
afterEach(() => vi.useRealTimers())

it('exposes the latest sample over IPC and totals Electron processes separately', async () => {
  vi.useFakeTimers()
  const send = vi.fn()
  vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
    { isDestroyed: () => false, webContents: { send } },
  ] as unknown as ReturnType<typeof BrowserWindow.getAllWindows>)
  vi.mocked(app.getAppMetrics).mockReturnValue([
    { cpu: { percentCPUUsage: 10 }, memory: { workingSetSize: 102400 } },
    { cpu: { percentCPUUsage: 2 }, memory: { workingSetSize: 204800 } },
  ] as ReturnType<typeof app.getAppMetrics>)
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    ;(args[3] as (error: Error | null, stdout: string) => void)(
      null,
      '10 1 30 409600',
    )
    return {} as ReturnType<typeof execFile>
  })
  const meter = registerAgentMeterIpc()
  try {
    const source = new MeterProcessSource()
    source.set(10)
    meter.attach('session', source)
    await vi.advanceTimersByTimeAsync(0)
    expect(meter.snapshot().convergence).toEqual({ cpu: 12, memoryMb: 300 })
    expect(send).toHaveBeenCalledWith('agentMeter:updated', meter.snapshot())
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'agentMeter:get',
      expect.any(Function),
    )
    const read = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([channel]) => channel === 'agentMeter:get')![1]
    expect(read({} as Electron.IpcMainInvokeEvent)).toEqual(meter.snapshot())
  } finally {
    meter.dispose()
  }
})
