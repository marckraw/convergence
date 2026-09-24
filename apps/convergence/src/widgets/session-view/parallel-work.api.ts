import type { ConversationWireEvent } from '@/shared/types/conversation-item.types'
import type { ConversationItem } from '@/entities/session'

export const parallelWorkApi = {
  read: async (sessionId: string) => {
    const [runs, tasks] = await Promise.all([
      window.electronAPI.session.listAgentRuns(sessionId),
      window.electronAPI.session.listTasks(sessionId),
    ])
    return { runs, tasks }
  },
  /**
   * Every item that belongs to one row, read from main by id (MAR-3310 O0b):
   * the items of any run with one of these ids, and of any task with one.
   * The two reads may share an item; the panel's merge deduplicates by id.
   */
  readDetail: async (
    sessionId: string,
    ids: string[],
  ): Promise<ConversationItem[]> => {
    const [runItems, taskItems] = await Promise.all([
      window.electronAPI.session.listRunItems(sessionId, ids),
      window.electronAPI.session.listTaskItems(sessionId, ids),
    ])
    return [...runItems, ...taskItems]
  },
  readTaskResultNotes: (
    sessionId: string,
    ids: string[],
  ): Promise<ConversationItem[]> =>
    window.electronAPI.session.listTaskResultNotes(sessionId, ids),
  subscribeConversation: (
    listener: (event: ConversationWireEvent<ConversationItem>) => void,
  ) => window.electronAPI.session.onSessionConversationPatched(listener),
  subscribe: (listener: (event: { sessionId: string }) => void) =>
    window.electronAPI.session.onEvidenceUpdated(listener),
  stop: (sessionId: string, id: string) =>
    window.electronAPI.session.stopTask(sessionId, id),
}
