import type { ConversationRoutineAction } from './conversation-actions.types'

export const conversationActionsApi = {
  describe: (sessionId: string): Promise<ConversationRoutineAction[]> =>
    window.electronAPI.conversationActions.describe(sessionId),
}
