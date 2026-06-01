import type { AppSettingsService } from '../app-settings/app-settings.service'
import type { ConversationItem } from '../session/conversation-item.types'
import type {
  SendMessageInput,
  SessionService,
} from '../session/session.service'
import type {
  CreateSessionInput,
  PrimarySurface,
  QueuedInputPatchEvent,
  Session,
  SessionQueuedInput,
  SessionSummary,
} from '../session/session.types'
import type { TurnDelta } from '../session/turn/turn-capture.service'

export type SessionAppCommandInput = SendMessageInput

export type SessionAppBackend = Pick<
  SessionService,
  | 'create'
  | 'getSummariesByProjectId'
  | 'getAllSummaries'
  | 'getGlobalSummaries'
  | 'getSummaryById'
  | 'getConversation'
  | 'archive'
  | 'unarchive'
  | 'delete'
  | 'start'
  | 'sendMessage'
  | 'getQueuedInputs'
  | 'cancelQueuedInput'
  | 'approve'
  | 'deny'
  | 'stop'
  | 'rename'
  | 'regenerateName'
  | 'setPrimarySurface'
  | 'setHtmlModeEnabled'
  | 'setSummaryUpdateListener'
  | 'setConversationPatchListener'
  | 'setQueuedInputPatchListener'
  | 'setTurnDeltaListener'
>

type SessionDefaultsResolver = Pick<
  AppSettingsService,
  'resolveSessionDefaults'
>

export class SessionAppService {
  constructor(
    private readonly sessions: SessionAppBackend,
    private readonly defaults: SessionDefaultsResolver,
  ) {}

  async createSession(input: CreateSessionInput): Promise<Session> {
    return this.sessions.create(await this.resolveCreateSessionInput(input))
  }

  listProjectSessions(projectId: string): SessionSummary[] {
    return this.sessions.getSummariesByProjectId(projectId)
  }

  listSessions(): SessionSummary[] {
    return this.sessions.getAllSummaries()
  }

  listGlobalSessions(): SessionSummary[] {
    return this.sessions.getGlobalSummaries()
  }

  getSession(sessionId: string): SessionSummary | null {
    return this.sessions.getSummaryById(sessionId)
  }

  getConversation(sessionId: string): ConversationItem[] {
    return this.sessions.getConversation(sessionId)
  }

  archiveSession(sessionId: string): void {
    this.sessions.archive(sessionId)
  }

  unarchiveSession(sessionId: string): void {
    this.sessions.unarchive(sessionId)
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  async startSession(
    sessionId: string,
    input: SessionAppCommandInput,
  ): Promise<void> {
    await this.sessions.start(sessionId, input)
  }

  async sendSessionMessage(
    sessionId: string,
    input: SessionAppCommandInput,
  ): Promise<void> {
    await this.sessions.sendMessage(sessionId, input)
  }

  listQueuedInputs(sessionId: string): SessionQueuedInput[] {
    return this.sessions.getQueuedInputs(sessionId)
  }

  cancelQueuedInput(queuedInputId: string): void {
    this.sessions.cancelQueuedInput(queuedInputId)
  }

  approveAttentionRequest(
    sessionId: string,
    providerApprovalId?: string,
  ): void {
    this.sessions.approve(sessionId, providerApprovalId)
  }

  denyAttentionRequest(sessionId: string, providerApprovalId?: string): void {
    this.sessions.deny(sessionId, providerApprovalId)
  }

  stopSession(sessionId: string): void {
    this.sessions.stop(sessionId)
  }

  renameSession(sessionId: string, name: string): void {
    this.sessions.rename(sessionId, name)
  }

  async regenerateSessionName(
    sessionId: string,
    requestId?: string,
  ): Promise<{ updated: boolean }> {
    return this.sessions.regenerateName(sessionId, requestId)
  }

  setSessionPrimarySurface(
    sessionId: string,
    surface: PrimarySurface,
  ): Session {
    return this.sessions.setPrimarySurface(sessionId, surface)
  }

  setSessionHtmlModeEnabled(sessionId: string, enabled: boolean): Session {
    return this.sessions.setHtmlModeEnabled(sessionId, enabled)
  }

  onSessionSummaryUpdate(listener: (summary: SessionSummary) => void): void {
    this.sessions.setSummaryUpdateListener(listener)
  }

  onConversationPatch(
    listener: Parameters<SessionService['setConversationPatchListener']>[0],
  ): void {
    this.sessions.setConversationPatchListener(listener)
  }

  onQueuedInputPatch(listener: (event: QueuedInputPatchEvent) => void): void {
    this.sessions.setQueuedInputPatchListener(listener)
  }

  onTurnDelta(listener: (sessionId: string, delta: TurnDelta) => void): void {
    this.sessions.setTurnDeltaListener(listener)
  }

  private async resolveCreateSessionInput(
    input: CreateSessionInput,
  ): Promise<CreateSessionInput> {
    const defaults = await this.defaults.resolveSessionDefaults()
    if (!defaults) return input

    return {
      ...input,
      providerId: input.providerId || defaults.providerId,
      model: input.model ?? defaults.modelId,
      effort: input.effort ?? defaults.effortId,
    }
  }
}
