import { app, BrowserWindow, ipcMain } from 'electron'
import { AgentMeterService } from './agent-meter.service'
import { totalMeterUsage } from './agent-meter.pure'

export function registerAgentMeterIpc(): AgentMeterService {
  const service = new AgentMeterService({
    appUsage: () =>
      totalMeterUsage(
        app.getAppMetrics().map((metric) => ({
          cpu: metric.cpu.percentCPUUsage,
          memoryMb: metric.memory.workingSetSize / 1024,
        })),
      ),
    publish: (snapshot) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed())
          window.webContents.send('agentMeter:updated', snapshot)
      }
    },
  })
  ipcMain.handle('agentMeter:get', () => service.snapshot())
  return service
}
