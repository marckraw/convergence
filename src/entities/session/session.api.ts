import type {
  ConversationItem,
  ConversationPatchEvent,
  SessionSummary,
  ProviderInfo,
  ProviderStatusInfo,
  ReasoningEffort,
  NeedsYouDismissals,
} from './session.types'
import type { SkillSelection } from '@/shared/types/skill.types'

export const sessionApi = {
  create: (input: {
    projectId: string
    workspaceId: string | null
    providerId: string
    model: string | null
    effort: ReasoningEffort | null
    name: string
    primarySurface?: 'conversation' | 'terminal'
  }): Promise<SessionSummary> => window.electronAPI.session.create(input),

  getSummariesByProjectId: (projectId: string): Promise<SessionSummary[]> =>
    window.electronAPI.session.getSummariesByProjectId(projectId),

  getAllSummaries: (): Promise<SessionSummary[]> =>
    window.electronAPI.session.getAllSummaries(),

  getSummaryById: (id: string): Promise<SessionSummary | null> =>
    window.electronAPI.session.getSummaryById(id),

  getConversation: (id: string): Promise<ConversationItem[]> =>
    window.electronAPI.session.getConversation(id),

  archive: (id: string): Promise<void> =>
    window.electronAPI.session.archive(id),

  unarchive: (id: string): Promise<void> =>
    window.electronAPI.session.unarchive(id),

  delete: (id: string): Promise<void> => window.electronAPI.session.delete(id),

  start: (
    id: string,
    message: string,
    attachmentIds?: string[],
    skillSelections?: SkillSelection[],
  ): Promise<void> =>
    window.electronAPI.session.start(id, {
      text: message,
      attachmentIds,
      skillSelections,
    }),

  sendMessage: (
    id: string,
    text: string,
    attachmentIds?: string[],
    skillSelections?: SkillSelection[],
  ): Promise<void> =>
    window.electronAPI.session.sendMessage(id, {
      text,
      attachmentIds,
      skillSelections,
    }),

  approve: (id: string): Promise<void> =>
    window.electronAPI.session.approve(id),

  deny: (id: string): Promise<void> => window.electronAPI.session.deny(id),

  stop: (id: string): Promise<void> => window.electronAPI.session.stop(id),

  rename: (id: string, name: string): Promise<void> =>
    window.electronAPI.session.rename(id, name),

  regenerateName: (id: string): Promise<void> =>
    window.electronAPI.session.regenerateName(id),

  setPrimarySurface: (
    id: string,
    surface: 'conversation' | 'terminal',
  ): Promise<SessionSummary> =>
    window.electronAPI.session.setPrimarySurface(
      id,
      surface,
    ) as Promise<SessionSummary>,

  getNeedsYouDismissals: (): Promise<NeedsYouDismissals> =>
    window.electronAPI.session.getNeedsYouDismissals(),

  setNeedsYouDismissals: (dismissals: NeedsYouDismissals): Promise<void> =>
    window.electronAPI.session.setNeedsYouDismissals(dismissals),

  getRecentIds: (): Promise<string[]> =>
    window.electronAPI.session.getRecentIds(),

  setRecentIds: (ids: string[]): Promise<void> =>
    window.electronAPI.session.setRecentIds(ids),

  onSessionSummaryUpdate: (
    callback: (summary: SessionSummary) => void,
  ): (() => void) =>
    window.electronAPI.session.onSessionSummaryUpdate(callback),

  onSessionConversationPatched: (
    callback: (event: ConversationPatchEvent) => void,
  ): (() => void) =>
    window.electronAPI.session.onSessionConversationPatched(callback),
}

export const providerApi = {
  getAll: (): Promise<ProviderInfo[]> => window.electronAPI.provider.getAll(),
  getStatuses: (): Promise<ProviderStatusInfo[]> =>
    window.electronAPI.provider.getStatuses(),
}
