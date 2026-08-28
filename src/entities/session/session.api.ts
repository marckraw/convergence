import type {
  ConversationItem,
  ConversationPatchEvent,
  QueuedInputPatchEvent,
  SessionSummary,
  SessionQueuedInput,
  ProviderInfo,
  ProviderRuntimeInfo,
  ProviderStatusInfo,
  ProviderUpdateResult,
  ReasoningEffort,
  NeedsYouDismissals,
  SessionContextKind,
  SessionExecutionHostId,
  SessionPermissionConfig,
  SendSessionMessageRequest,
  StartSessionRequest,
} from './session.types'
import type { ProviderCatalog } from './provider-catalog.pure'

export const sessionApi = {
  create: (input: {
    contextKind?: SessionContextKind
    projectId?: string | null
    workspaceId?: string | null
    providerId: string
    model: string | null
    effort: ReasoningEffort | null
    serviceTier?: string | null
    permissionConfig?: SessionPermissionConfig
    name: string
    primarySurface?: 'conversation' | 'terminal'
    executionHost?: SessionExecutionHostId
  }): Promise<SessionSummary> => window.electronAPI.session.create(input),

  getSummariesByProjectId: (projectId: string): Promise<SessionSummary[]> =>
    window.electronAPI.session.getSummariesByProjectId(projectId),

  getAllSummaries: (): Promise<SessionSummary[]> =>
    window.electronAPI.session.getAllSummaries(),

  getGlobalSummaries: (): Promise<SessionSummary[]> =>
    window.electronAPI.session.getGlobalSummaries(),

  getSummaryById: (id: string): Promise<SessionSummary | null> =>
    window.electronAPI.session.getSummaryById(id),

  getConversation: (id: string): Promise<ConversationItem[]> =>
    window.electronAPI.session.getConversation(id),

  archive: (id: string): Promise<void> =>
    window.electronAPI.session.archive(id),

  unarchive: (id: string): Promise<void> =>
    window.electronAPI.session.unarchive(id),

  delete: (id: string): Promise<void> => window.electronAPI.session.delete(id),

  start: (request: StartSessionRequest): Promise<void> =>
    window.electronAPI.session.start(request.sessionId, {
      text: request.message,
      attachmentIds: request.attachmentIds,
      skillSelections: request.skillSelections,
      contextItemIds: request.contextItemIds,
      providerAccountId: request.providerAccountId,
    }),

  sendMessage: (request: SendSessionMessageRequest): Promise<void> =>
    window.electronAPI.session.sendMessage(request.sessionId, {
      text: request.text,
      attachmentIds: request.attachmentIds,
      skillSelections: request.skillSelections,
      deliveryMode: request.deliveryMode,
      interactionResponse: request.interactionResponse,
      providerAccountId: request.providerAccountId,
      muteRelays: request.muteRelays,
    }),

  compactContext: (id: string, instructions?: string): Promise<void> =>
    window.electronAPI.session.compactContext(id, instructions),

  approve: (id: string, providerApprovalId?: string): Promise<void> =>
    window.electronAPI.session.approve(id, providerApprovalId),

  deny: (id: string, providerApprovalId?: string): Promise<void> =>
    window.electronAPI.session.deny(id, providerApprovalId),

  stop: (id: string): Promise<void> => window.electronAPI.session.stop(id),

  rename: (id: string, name: string): Promise<void> =>
    window.electronAPI.session.rename(id, name),

  regenerateName: (
    id: string,
    requestId?: string,
  ): Promise<{ updated: boolean }> =>
    window.electronAPI.session.regenerateName(id, requestId),

  setPrimarySurface: (
    id: string,
    surface: 'conversation' | 'terminal',
  ): Promise<SessionSummary> =>
    window.electronAPI.session.setPrimarySurface(
      id,
      surface,
    ) as Promise<SessionSummary>,

  setModelSelection: (
    id: string,
    input: {
      providerId: string
      model: string | null
      effort: ReasoningEffort | null
    },
  ): Promise<SessionSummary> =>
    window.electronAPI.session.setModelSelection(
      id,
      input,
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

  getQueuedInputs: (sessionId: string): Promise<SessionQueuedInput[]> =>
    window.electronAPI.session.getQueuedInputs(sessionId),

  cancelQueuedInput: (id: string): Promise<void> =>
    window.electronAPI.session.cancelQueuedInput(id),

  onSessionQueuedInputPatched: (
    callback: (event: QueuedInputPatchEvent) => void,
  ): (() => void) =>
    window.electronAPI.session.onSessionQueuedInputPatched(callback),
}

export const providerApi = {
  /**
   * One machine's catalog. The argument is the machine: omitted means this one,
   * which is what every surface but the composer means (MAR-2682).
   */
  getAll: (executionHostId?: string | null): Promise<ProviderCatalog> =>
    window.electronAPI.provider.getAll(executionHostId),
  getAllAvailable: (): Promise<ProviderInfo[]> =>
    window.electronAPI.provider.getAllAvailable(),
  getStatuses: (): Promise<ProviderStatusInfo[]> =>
    window.electronAPI.provider.getStatuses(),
  getRuntimeInfo: (): Promise<ProviderRuntimeInfo> =>
    window.electronAPI.provider.getRuntimeInfo(),
  update: (providerId: string): Promise<ProviderUpdateResult> =>
    window.electronAPI.provider.update(providerId),
}
