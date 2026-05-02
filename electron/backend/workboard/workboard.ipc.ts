import { BrowserWindow, ipcMain } from 'electron'
import type { WorkboardService } from './workboard.service'
import type {
  StartWorkboardRunInput,
  UpsertWorkboardProjectMappingInput,
  UpsertWorkboardTrackerSourceInput,
} from './workboard.types'

export function broadcastWorkboardSnapshot(snapshot: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('workboard:snapshotUpdated', snapshot)
  }
}

export function registerWorkboardIpcHandlers(
  workboardService: WorkboardService,
): void {
  workboardService.setSnapshotListener(broadcastWorkboardSnapshot)

  ipcMain.handle('workboard:getSnapshot', () => workboardService.getSnapshot())

  ipcMain.handle('workboard:syncSources', async () => {
    const snapshot = await workboardService.syncSources()
    broadcastWorkboardSnapshot(snapshot)
    return snapshot
  })

  ipcMain.handle('workboard:listTrackerSources', () =>
    workboardService.listTrackerSources(),
  )

  ipcMain.handle(
    'workboard:upsertTrackerSource',
    (_event, input: UpsertWorkboardTrackerSourceInput) =>
      workboardService.upsertTrackerSource(input),
  )

  ipcMain.handle('workboard:listProjectMappings', () =>
    workboardService.listProjectMappings(),
  )

  ipcMain.handle(
    'workboard:upsertProjectMapping',
    (_event, input: UpsertWorkboardProjectMappingInput) =>
      workboardService.upsertProjectMapping(input),
  )

  ipcMain.handle(
    'workboard:startRun',
    async (_event, input: StartWorkboardRunInput) => {
      const result = await workboardService.startRun(input)
      broadcastWorkboardSnapshot(result.snapshot)
      return result
    },
  )

  ipcMain.handle('workboard:stopRun', (_event, runId: string) => {
    const snapshot = workboardService.stopRun(runId)
    broadcastWorkboardSnapshot(snapshot)
    return snapshot
  })

  ipcMain.handle('workboard:getRunEvents', (_event, runId: string) =>
    workboardService.getRunEvents(runId),
  )
}
