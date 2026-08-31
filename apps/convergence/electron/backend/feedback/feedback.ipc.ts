import { ipcMain } from 'electron'
import type { FeedbackService } from './feedback.service'
import type { SubmitFeedbackInput } from './feedback.types'

export function registerFeedbackIpcHandlers(service: FeedbackService): void {
  ipcMain.handle('feedback:submit', (_event, input: SubmitFeedbackInput) =>
    service.submit(input),
  )
}
