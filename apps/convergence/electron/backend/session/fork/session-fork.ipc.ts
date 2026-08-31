import { ipcMain } from 'electron'
import type { SessionForkService } from './session-fork.service'
import type {
  ForkFullInput,
  ForkSummarizeWith,
  ForkSummaryInput,
} from './session-fork.types'

export function registerSessionForkIpcHandlers(
  service: SessionForkService,
): void {
  ipcMain.handle(
    'session:fork:previewSummary',
    (
      _event,
      parentId: string,
      requestId?: string,
      summarizeWith?: ForkSummarizeWith,
    ) => service.previewSummary(parentId, requestId, summarizeWith),
  )

  ipcMain.handle('session:fork:full', (_event, input: ForkFullInput) =>
    service.forkFull(input),
  )

  ipcMain.handle('session:fork:summary', (_event, input: ForkSummaryInput) =>
    service.forkSummary(input),
  )
}
