import { ipcMain } from 'electron'
import type { ConversationActionsService } from './conversation-actions.service'

export function registerConversationActionsIpcHandlers(
  service: Pick<ConversationActionsService, 'describe'>,
): void {
  ipcMain.handle('conversationActions:describe', (_event, sessionId: string) =>
    service.describe(sessionId),
  )
}
