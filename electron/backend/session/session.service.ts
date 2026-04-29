import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type {
  ConversationItemRow,
  SessionQueuedInputRow,
  SessionRow,
} from '../database/database.types'
import type { ProviderRegistry } from '../provider/provider-registry'
import type {
  Attachment,
  MidRunInputMode,
  SessionHandle,
  SessionStatus,
  AttentionState,
  ActivitySignal,
} from '../provider/provider.types'
import {
  getMidRunInputCapabilityForProviderId,
  supportsMidRunInputMode,
} from '../provider/provider-descriptor.pure'
import type { AttachmentsService } from '../attachments/attachments.service'
import type { SkillSelection } from '../skills/skills.types'
import {
  sessionSummaryFromRow,
  type Session,
  type SessionSummary,
  type CreateSessionInput,
  type QueuedInputPatchEvent,
  type QueuedInputState,
  type SessionQueuedInput,
} from './session.types'
import type {
  ConversationItem,
  ConversationItemDraft,
  ConversationPatchEvent,
  SessionDelta,
} from './conversation-item.types'
import {
  conversationItemFromRow,
  conversationItemToInsertRow,
} from './conversation-item.pure'
import type { TurnCaptureService } from './turn/turn-capture.service'
import type { TurnDelta } from './turn/turn-capture.service'
import type { ProjectContextService } from '../project-context/project-context.service'
import { projectContextItemToSerializable } from '../project-context/project-context.types'
import { serializeBootBlock } from '../project-context/project-context-serializer.pure'
import { projectNameToSlug } from '../project-context/project-slug.pure'

type UserMessageDraft = Extract<
  ConversationItem,
  { kind: 'message'; actor: 'user' }
>
type UserMessageDraftInput = Omit<UserMessageDraft, 'sessionId' | 'sequence'>

export interface SendMessageInput {
  text: string
  attachmentIds?: string[]
  skillSelections?: SkillSelection[]
  deliveryMode?: MidRunInputMode
  /**
   * Only consumed by `start`. Replaces the session's attached project context
   * items before computing the boot-injected block. Pass an empty array to
   * clear; omit to leave existing attachments unchanged.
   */
  contextItemIds?: string[]
}

export interface SessionNamer {
  generateName(
    session: SessionSummary,
    conversation: ConversationItem[],
  ): Promise<string | null>
}

export interface SessionAttentionObserver {
  onAttentionTransition(
    prev: AttentionState,
    next: AttentionState,
    session: Session,
  ): void
}

export class SessionService {
  private activeHandles = new Map<string, SessionHandle>()
  private activeTurnIds = new Map<string, string>()
  private onSummaryUpdate: ((summary: SessionSummary) => void) | null = null
  private onConversationPatch:
    | ((event: ConversationPatchEvent) => void)
    | null = null
  private onQueuedInputPatch: ((event: QueuedInputPatchEvent) => void) | null =
    null
  private onTurnDelta: ((sessionId: string, delta: TurnDelta) => void) | null =
    null
  private attachments: AttachmentsService | null = null
  private namer: SessionNamer | null = null
  private attentionObserver: SessionAttentionObserver | null = null
  private turnCapture: TurnCaptureService | null = null
  private projectContext: ProjectContextService | null = null

  constructor(
    private db: Database.Database,
    private providers: ProviderRegistry,
  ) {
    this.recoverStaleRunningSessions()
    this.recoverDispatchingQueuedInputs()
  }

  setTurnCaptureService(service: TurnCaptureService): void {
    this.turnCapture = service
    service.setDeltaEmitter((sessionId, delta) => {
      this.onTurnDelta?.(sessionId, delta)
    })
  }

  setTurnDeltaListener(
    listener: (sessionId: string, delta: TurnDelta) => void,
  ): void {
    this.onTurnDelta = listener
  }

  setProjectContextService(service: ProjectContextService): void {
    this.projectContext = service
  }

  setAttachmentsService(service: AttachmentsService): void {
    this.attachments = service
  }

  setNamer(namer: SessionNamer): void {
    this.namer = namer
  }

  setAttentionObserver(observer: SessionAttentionObserver): void {
    this.attentionObserver = observer
  }

  rename(id: string, name: string): Session {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 120) {
      throw new Error('Session name must be 1-120 characters')
    }
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)
    this.db
      .prepare(
        "UPDATE sessions SET name = ?, name_auto_generated = 1, updated_at = datetime('now') WHERE id = ?",
      )
      .run(trimmed, id)
    this.notifySessionChange(id)
    return this.getById(id)!
  }

  setPrimarySurface(id: string, surface: 'conversation' | 'terminal'): Session {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)
    if (surface === 'conversation' && session.providerId === 'shell') {
      throw new Error(
        `Session ${id} uses the shell provider and cannot be flipped to conversation-primary without attaching a real provider`,
      )
    }
    this.db
      .prepare(
        "UPDATE sessions SET primary_surface = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(surface, id)
    this.notifySessionChange(id)
    return this.getById(id)!
  }

  async regenerateName(id: string): Promise<void> {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)
    await this.runNaming(session)
  }

  markShellSessionExited(id: string, exitCode: number): void {
    const session = this.getById(id)
    if (!session) return
    if (session.providerId !== 'shell') return

    this.applySessionPatch(id, {
      status: exitCode === 0 ? 'completed' : 'failed',
      attention: exitCode === 0 ? 'finished' : 'failed',
      activity: null,
      updatedAt: new Date().toISOString(),
    })
    this.notifySessionChange(id)
  }

  private async runNaming(session: SessionSummary): Promise<void> {
    if (!this.namer) return
    const title = await this.namer.generateName(
      session,
      this.getConversation(session.id),
    )
    if (!title) return
    this.db
      .prepare(
        "UPDATE sessions SET name = ?, name_auto_generated = 1, updated_at = datetime('now') WHERE id = ?",
      )
      .run(title, session.id)
    this.notifySessionChange(session.id)
  }

  private hasBeenAutoNamed(id: string): boolean {
    const row = this.db
      .prepare('SELECT name_auto_generated FROM sessions WHERE id = ?')
      .get(id) as { name_auto_generated: number } | undefined
    return (row?.name_auto_generated ?? 0) === 1
  }

  setSummaryUpdateListener(listener: (summary: SessionSummary) => void): void {
    this.onSummaryUpdate = listener
  }

  setConversationPatchListener(
    listener: (event: ConversationPatchEvent) => void,
  ): void {
    this.onConversationPatch = listener
  }

  setQueuedInputPatchListener(
    listener: (event: QueuedInputPatchEvent) => void,
  ): void {
    this.onQueuedInputPatch = listener
  }

  create(input: CreateSessionInput): Session {
    const id = randomUUID()

    // Resolve working directory
    let workingDirectory: string
    if (input.workspaceId) {
      const ws = this.db
        .prepare('SELECT path FROM workspaces WHERE id = ?')
        .get(input.workspaceId) as { path: string } | undefined
      if (!ws) throw new Error(`Workspace not found: ${input.workspaceId}`)
      workingDirectory = ws.path
    } else {
      const proj = this.db
        .prepare('SELECT repository_path FROM projects WHERE id = ?')
        .get(input.projectId) as { repository_path: string } | undefined
      if (!proj) throw new Error(`Project not found: ${input.projectId}`)
      workingDirectory = proj.repository_path
    }

    this.db
      .prepare(
        `INSERT INTO sessions (
           id,
           project_id,
           workspace_id,
           provider_id,
           model,
           effort,
           name,
           working_directory,
           parent_session_id,
           fork_strategy,
           primary_surface
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        input.workspaceId,
        input.providerId,
        input.model,
        input.effort,
        input.name,
        workingDirectory,
        input.parentSessionId ?? null,
        input.forkStrategy ?? null,
        input.primarySurface ?? 'conversation',
      )

    return this.getSummaryById(id)!
  }

  getByProjectId(projectId: string): Session[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC',
      )
      .all(projectId) as SessionRow[]

    return rows.map(sessionSummaryFromRow)
  }

  getAll(): Session[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY created_at DESC')
      .all() as SessionRow[]

    return rows.map(sessionSummaryFromRow)
  }

  getSummariesByProjectId(projectId: string): SessionSummary[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC',
      )
      .all(projectId) as SessionRow[]

    return rows.map(sessionSummaryFromRow)
  }

  getAllSummaries(): SessionSummary[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY created_at DESC')
      .all() as SessionRow[]

    return rows.map(sessionSummaryFromRow)
  }

  getById(id: string): Session | null {
    const row = this.getRowById(id)

    return row ? sessionSummaryFromRow(row) : null
  }

  getSummaryById(id: string): SessionSummary | null {
    const row = this.getRowById(id)
    return row ? sessionSummaryFromRow(row) : null
  }

  getConversation(id: string): ConversationItem[] {
    const rows = this.db
      .prepare(
        `SELECT items.*, sessions.provider_id
         FROM session_conversation_items items
         INNER JOIN sessions ON sessions.id = items.session_id
         WHERE items.session_id = ?
         ORDER BY items.sequence ASC`,
      )
      .all(id) as ConversationItemRow[]

    return rows.map(conversationItemFromRow)
  }

  getQueuedInputs(sessionId: string): SessionQueuedInput[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM session_queued_inputs
         WHERE session_id = ?
           AND state IN ('queued', 'dispatching', 'failed')
         ORDER BY created_at ASC`,
      )
      .all(sessionId) as SessionQueuedInputRow[]

    return rows.map(queuedInputFromRow)
  }

  cancelQueuedInput(id: string): void {
    const row = this.getQueuedInputRowById(id)
    if (!row) throw new Error(`Queued input not found: ${id}`)
    if (row.state !== 'queued') {
      throw new Error(`Queued input cannot be cancelled from ${row.state}`)
    }

    this.patchQueuedInput(id, 'cancelled')
  }

  delete(id: string): void {
    const handle = this.activeHandles.get(id)
    if (handle) {
      handle.stop()
      this.activeHandles.delete(id)
    }
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    if (this.attachments) {
      void this.attachments.deleteForSession(id)
    }
  }

  archive(id: string): void {
    if (!this.getById(id)) throw new Error(`Session not found: ${id}`)
    this.updateArchiveState(id, new Date().toISOString())
  }

  unarchive(id: string): void {
    if (!this.getById(id)) throw new Error(`Session not found: ${id}`)
    this.updateArchiveState(id, null)
  }

  async start(id: string, input: SendMessageInput): Promise<void> {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)

    if (session.archivedAt) {
      this.updateArchiveState(id, null)
    }

    await this.rebindDraftAttachments(id, input.attachmentIds)
    const attachments = this.resolveAttachments(input.attachmentIds)

    if (input.contextItemIds !== undefined && this.projectContext) {
      this.projectContext.attachToSession(id, input.contextItemIds)
    }

    const initialMessage = this.injectBootContextBlock(session, input.text)

    this.startHandle(
      session,
      initialMessage,
      this.getContinuationToken(id),
      attachments,
      input.attachmentIds,
      input.skillSelections,
    )
  }

  private injectBootContextBlock(
    session: Session,
    originalText: string,
  ): string {
    if (!this.projectContext) return originalText
    const items = this.projectContext.listForSession(session.id)
    if (items.length === 0) return originalText

    const slug = this.resolveProjectSlugForSession(session)
    const result = serializeBootBlock({
      slug,
      items: items.map(projectContextItemToSerializable),
      originalText,
    })

    if (result.note !== null) {
      this.recordBootContextNote(session.id, result.note)
    }
    return result.augmentedText
  }

  private resolveProjectSlugForSession(session: Session): string {
    const row = this.db
      .prepare('SELECT name FROM projects WHERE id = ?')
      .get(session.projectId) as { name: string } | undefined
    return projectNameToSlug(row?.name ?? '')
  }

  private recordBootContextNote(sessionId: string, body: string): void {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    const draft: ConversationItemDraft = {
      id,
      kind: 'note',
      level: 'info',
      text: body,
      state: 'complete',
      turnId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      providerMeta: {
        providerId: 'convergence',
        providerItemId: null,
        providerEventType: 'context.boot',
      },
    }
    const item = this.addConversationItem(sessionId, draft)
    if (item) {
      this.notifySessionChange(sessionId, {
        sessionId,
        op: 'add',
        item,
      })
    }
  }

  async sendMessage(id: string, input: SendMessageInput): Promise<void> {
    let session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)

    if (session.providerId === 'shell') {
      throw new Error(
        `Session ${id} uses the shell provider and cannot accept conversation messages`,
      )
    }

    if (session.archivedAt) {
      this.updateArchiveState(id, null)
    }

    await this.rebindDraftAttachments(id, input.attachmentIds)
    const attachments = this.resolveAttachments(input.attachmentIds)

    const handle = this.activeHandles.get(id)
    if (!handle && session.status === 'running') {
      session = this.markStaleRunningSessionFailed(
        session,
        'Session marked failed because Convergence no longer has an active provider process for this run.',
        true,
      )
    }

    const deliveryMode = this.resolveDeliveryMode(session, input.deliveryMode)

    if (handle) {
      this.dispatchToActiveHandle({
        session,
        handle,
        input,
        attachments,
        deliveryMode,
      })
      return
    }

    const provider = this.providers.get(session.providerId)
    if (!provider) throw new Error(`Provider not found: ${session.providerId}`)

    const continuationToken = this.getContinuationToken(id)
    if (
      deliveryMode === 'follow-up' &&
      session.status === 'running' &&
      getMidRunInputCapabilityForProviderId(session.providerId)
        .supportsAppQueuedFollowUp
    ) {
      this.queueInput(session.id, input, 'follow-up')
      return
    }

    if (deliveryMode !== 'normal') {
      throw new Error(
        `Session cannot accept ${deliveryMode} input while inactive`,
      )
    }

    if (provider.supportsContinuation && continuationToken) {
      this.startHandle(
        session,
        input.text,
        continuationToken,
        attachments,
        input.attachmentIds,
        input.skillSelections,
      )
      return
    }

    if (provider.supportsContinuation) {
      throw new Error(
        `Session cannot be resumed: missing continuation state. Start a new session.`,
      )
    }

    throw new Error(`Session not active: ${id}`)
  }

  private dispatchToActiveHandle(input: {
    session: Session
    handle: SessionHandle
    input: SendMessageInput
    attachments: Attachment[] | undefined
    deliveryMode: MidRunInputMode
  }): void {
    const { session, handle, attachments, deliveryMode } = input
    const capability = getMidRunInputCapabilityForProviderId(session.providerId)

    if (
      session.status !== 'running' &&
      deliveryMode !== 'normal' &&
      deliveryMode !== 'answer'
    ) {
      throw new Error(
        `Session cannot accept ${deliveryMode} input while ${session.status}`,
      )
    }

    if (!supportsMidRunInputMode(capability, deliveryMode)) {
      throw new Error(
        `${session.providerId} does not support ${deliveryMode} input`,
      )
    }

    if (deliveryMode === 'follow-up' && session.status === 'running') {
      if (!capability.supportsNativeFollowUp) {
        this.queueInput(session.id, input.input, 'follow-up')
        return
      }
    }

    const shouldStartConversationTurn =
      deliveryMode === 'normal' || deliveryMode === 'answer'
    if (shouldStartConversationTurn) {
      this.pendingUserAttachmentIds.set(
        session.id,
        input.input.attachmentIds ?? [],
      )
      this.pendingUserSkillSelections.set(
        session.id,
        input.input.skillSelections ?? [],
      )
    }

    handle.sendMessage(
      input.input.text,
      attachments,
      input.input.skillSelections,
      {
        deliveryMode,
      },
    )
  }

  private resolveDeliveryMode(
    session: Session,
    requested: MidRunInputMode | undefined,
  ): MidRunInputMode {
    if (requested) return requested
    if (session.attention === 'needs-input') return 'answer'
    if (session.status === 'running') {
      const mode = getMidRunInputCapabilityForProviderId(
        session.providerId,
      ).defaultRunningMode
      if (!mode) {
        throw new Error(
          `${session.providerId} does not support messages while running`,
        )
      }
      return mode
    }
    return 'normal'
  }

  private pendingUserAttachmentIds = new Map<string, string[]>()
  private pendingUserSkillSelections = new Map<string, SkillSelection[]>()

  private async rebindDraftAttachments(
    sessionId: string,
    attachmentIds: string[] | undefined,
  ): Promise<void> {
    if (!attachmentIds || attachmentIds.length === 0) return
    if (!this.attachments) return
    await this.attachments.rebindToSession(attachmentIds, sessionId)
  }

  private resolveAttachments(
    attachmentIds: string[] | undefined,
  ): Attachment[] | undefined {
    if (!attachmentIds || attachmentIds.length === 0) return undefined
    if (!this.attachments) {
      throw new Error(
        'Attachments service is not configured; cannot resolve attachment ids',
      )
    }
    const resolved = this.attachments.getMany(attachmentIds)
    if (resolved.length !== attachmentIds.length) {
      const resolvedIds = new Set(resolved.map((a) => a.id))
      const missing = attachmentIds.filter((id) => !resolvedIds.has(id))
      throw new Error(`Attachment(s) not found: ${missing.join(', ')}`)
    }
    return resolved
  }

  approve(id: string): void {
    const handle = this.activeHandles.get(id)
    if (!handle) throw new Error(`Session not active: ${id}`)
    handle.approve()
  }

  deny(id: string): void {
    const handle = this.activeHandles.get(id)
    if (!handle) throw new Error(`Session not active: ${id}`)
    handle.deny()
  }

  stop(id: string): void {
    const handle = this.activeHandles.get(id)
    if (!handle) {
      const session = this.getById(id)
      if (session?.status === 'running') {
        this.markStaleRunningSessionFailed(
          session,
          'Session marked failed because Convergence no longer has an active provider process to stop.',
          true,
        )
        return
      }
      throw new Error(`Session not active: ${id}`)
    }
    handle.stop()
    this.activeHandles.delete(id)
  }

  private applyDelta(sessionId: string, delta: SessionDelta): void {
    switch (delta.kind) {
      case 'session.patch':
        this.applySessionPatch(sessionId, delta.patch)
        this.handleLifecycle(sessionId, delta.patch.status)
        this.notifySessionChange(sessionId)
        return

      case 'conversation.item.add': {
        const item = this.addConversationItem(sessionId, delta.item)
        if (!item) return
        this.handleAssistantNaming(sessionId, item)
        this.notifySessionChange(sessionId, {
          sessionId,
          op: 'add',
          item,
        })
        return
      }

      case 'conversation.item.patch': {
        const item = this.patchConversationItem(
          sessionId,
          delta.itemId,
          delta.patch,
        )
        if (!item) return
        this.notifySessionChange(sessionId, {
          sessionId,
          op: 'patch',
          item,
        })
      }
    }
  }

  private addConversationItem(
    sessionId: string,
    itemDraft: ConversationItemDraft,
  ): ConversationItem | null {
    const row = this.getRowById(sessionId)
    if (!row) return null

    const latest = this.db
      .prepare(
        `SELECT turn_id
         FROM session_conversation_items
         WHERE session_id = ?
         ORDER BY sequence DESC
         LIMIT 1`,
      )
      .get(sessionId) as { turn_id: string | null } | undefined

    const nextSequence = (row.last_sequence ?? 0) + 1
    const pendingAttachments = this.pendingUserAttachmentIds.get(sessionId)
    const pendingSkillSelections =
      this.pendingUserSkillSelections.get(sessionId)
    const isUserMessage =
      itemDraft.kind === 'message' &&
      (itemDraft as { actor?: unknown }).actor === 'user'
    const turnId = isUserMessage ? randomUUID() : (latest?.turn_id ?? null)

    let item: ConversationItem
    if (isUserMessage) {
      const userMessageDraft = itemDraft as unknown as UserMessageDraftInput
      item = {
        ...(userMessageDraft as unknown as ConversationItemDraft),
        sessionId,
        sequence: nextSequence,
        turnId,
        attachmentIds:
          userMessageDraft.attachmentIds ??
          (pendingAttachments && pendingAttachments.length > 0
            ? pendingAttachments
            : undefined),
        skillSelections:
          userMessageDraft.skillSelections ??
          (pendingSkillSelections && pendingSkillSelections.length > 0
            ? pendingSkillSelections
            : undefined),
      } as ConversationItem
    } else {
      item = {
        ...itemDraft,
        sessionId,
        sequence: nextSequence,
        turnId,
      } as ConversationItem
    }

    if (item.kind === 'message' && item.actor === 'user') {
      this.pendingUserAttachmentIds.delete(sessionId)
      this.pendingUserSkillSelections.delete(sessionId)
    }

    const insertRow = conversationItemToInsertRow(item)

    this.db
      .prepare(
        `INSERT INTO session_conversation_items (
           id,
           session_id,
           sequence,
           turn_id,
           kind,
           state,
           payload_json,
           provider_item_id,
           provider_event_type,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        insertRow.id,
        insertRow.sessionId,
        insertRow.sequence,
        insertRow.turnId,
        insertRow.kind,
        insertRow.state,
        insertRow.payloadJson,
        insertRow.providerItemId,
        insertRow.providerEventType,
        insertRow.createdAt,
        insertRow.updatedAt,
      )

    this.db
      .prepare(
        'UPDATE sessions SET last_sequence = ?, conversation_version = 2, updated_at = ? WHERE id = ?',
      )
      .run(nextSequence, item.updatedAt, sessionId)

    if (isUserMessage && this.turnCapture && turnId) {
      this.activeTurnIds.set(sessionId, turnId)
      void this.turnCapture.startTurn({
        sessionId,
        turnId,
        workingDirectory: row.working_directory,
      })
    }

    return item
  }

  private patchConversationItem(
    sessionId: string,
    itemId: string,
    patch: Partial<ConversationItem>,
  ): ConversationItem | null {
    const existing = this.db
      .prepare(
        `SELECT items.*, sessions.provider_id
         FROM session_conversation_items items
         INNER JOIN sessions ON sessions.id = items.session_id
         WHERE items.session_id = ? AND items.id = ?`,
      )
      .get(sessionId, itemId) as ConversationItemRow | undefined

    if (!existing) return null

    const current = conversationItemFromRow(existing)
    const merged = {
      ...current,
      ...patch,
      providerMeta: {
        ...current.providerMeta,
        ...(patch.providerMeta ?? {}),
      },
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    } as ConversationItem
    const row = conversationItemToInsertRow(merged)

    this.db
      .prepare(
        `UPDATE session_conversation_items
         SET turn_id = ?,
             kind = ?,
             state = ?,
             payload_json = ?,
             provider_item_id = ?,
             provider_event_type = ?,
             updated_at = ?
         WHERE session_id = ? AND id = ?`,
      )
      .run(
        row.turnId,
        row.kind,
        row.state,
        row.payloadJson,
        row.providerItemId,
        row.providerEventType,
        row.updatedAt,
        sessionId,
        itemId,
      )

    this.db
      .prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
      .run(merged.updatedAt, sessionId)

    return merged
  }

  private applySessionPatch(
    sessionId: string,
    patch: Extract<SessionDelta, { kind: 'session.patch' }>['patch'],
  ): void {
    const row = this.getRowById(sessionId)
    if (!row) return

    const prevAttention = row.attention as AttentionState
    const nextStatus = patch.status ?? (row.status as SessionStatus)
    const nextAttention = patch.attention ?? prevAttention
    const nextActivity =
      patch.activity !== undefined
        ? patch.activity
        : nextStatus !== 'running'
          ? null
          : ((row.activity as ActivitySignal) ?? null)
    const nextArchivedAt =
      row.archived_at &&
      (nextAttention === 'needs-approval' || nextAttention === 'needs-input')
        ? null
        : row.archived_at

    this.db
      .prepare(
        `UPDATE sessions
         SET status = ?,
             attention = ?,
             activity = ?,
             context_window = ?,
             continuation_token = ?,
             archived_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        nextStatus,
        nextAttention ?? row.attention,
        nextActivity,
        patch.contextWindow !== undefined
          ? patch.contextWindow
            ? JSON.stringify(patch.contextWindow)
            : null
          : row.context_window,
        patch.continuationToken !== undefined
          ? patch.continuationToken?.trim()
            ? patch.continuationToken
            : row.continuation_token
          : row.continuation_token,
        nextArchivedAt,
        patch.updatedAt ?? new Date().toISOString(),
        sessionId,
      )

    if (nextAttention !== prevAttention) {
      this.notifyAttention(sessionId, prevAttention, nextAttention)
    }
  }

  private updateField(id: string, field: string, value: string | null): void {
    this.db
      .prepare(
        `UPDATE sessions SET ${field} = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(value, id)

    this.notifySessionChange(id)
  }

  private updateArchiveState(id: string, archivedAt: string | null): void {
    this.db
      .prepare(
        "UPDATE sessions SET archived_at = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(archivedAt, id)

    this.notifySessionChange(id)
  }

  private notifyAttention(
    id: string,
    prev: AttentionState,
    next: AttentionState,
  ): void {
    if (!this.attentionObserver) return
    const session = this.getById(id)
    if (!session) return
    this.attentionObserver.onAttentionTransition(prev, next, session)
  }

  private notifySummaryUpdated(id: string): void {
    if (!this.onSummaryUpdate) return
    const summary = this.getSummaryById(id)
    if (summary) {
      this.onSummaryUpdate(summary)
    }
  }

  private notifySessionChange(
    id: string,
    conversationPatch?: ConversationPatchEvent,
  ): void {
    this.notifySummaryUpdated(id)
    if (conversationPatch && this.onConversationPatch) {
      this.onConversationPatch(conversationPatch)
    }
  }

  private getRowById(id: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined
  }

  private getContinuationToken(id: string): string | null {
    return this.getRowById(id)?.continuation_token ?? null
  }

  private startHandle(
    session: Session,
    initialMessage: string,
    continuationToken: string | null,
    initialAttachments?: Attachment[],
    initialAttachmentIds?: string[],
    initialSkillSelections?: SkillSelection[],
  ): void {
    const provider = this.providers.get(session.providerId)
    if (!provider) throw new Error(`Provider not found: ${session.providerId}`)

    if (initialAttachmentIds && initialAttachmentIds.length > 0) {
      this.pendingUserAttachmentIds.set(session.id, initialAttachmentIds)
    }
    if (initialSkillSelections && initialSkillSelections.length > 0) {
      this.pendingUserSkillSelections.set(session.id, initialSkillSelections)
    }

    const handle = provider.start({
      sessionId: session.id,
      workingDirectory: session.workingDirectory,
      initialMessage,
      initialSkillSelections,
      model: session.model,
      effort: session.effort,
      continuationToken,
      initialAttachments,
    })

    this.activeHandles.set(session.id, handle)
    handle.onDelta((delta: SessionDelta) => {
      this.applyDelta(session.id, delta)
    })
  }

  private handleLifecycle(
    sessionId: string,
    status: SessionStatus | undefined,
  ): void {
    if (status === 'failed') {
      this.activeHandles.delete(sessionId)
      this.closeActiveTurn(sessionId, 'errored')
    } else if (status === 'completed') {
      const summary = this.getSummaryById(sessionId)
      if (
        summary &&
        !this.providers.get(summary.providerId)?.supportsContinuation
      ) {
        this.activeHandles.delete(sessionId)
      }
      this.closeActiveTurn(sessionId, 'completed')
      this.dispatchNextQueuedInput(sessionId)
    }
  }

  private queueInput(
    sessionId: string,
    input: SendMessageInput,
    deliveryMode: Extract<MidRunInputMode, 'follow-up' | 'steer' | 'interrupt'>,
  ): SessionQueuedInput {
    const timestamp = new Date().toISOString()
    const item: SessionQueuedInput = {
      id: randomUUID(),
      sessionId,
      deliveryMode,
      state: 'queued',
      text: input.text,
      attachmentIds: input.attachmentIds ?? [],
      skillSelections: input.skillSelections ?? [],
      providerRequestId: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    this.db
      .prepare(
        `INSERT INTO session_queued_inputs (
           id,
           session_id,
           delivery_mode,
           state,
           text,
           attachment_ids_json,
           skill_selections_json,
           provider_request_id,
           error,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        item.id,
        item.sessionId,
        item.deliveryMode,
        item.state,
        item.text,
        JSON.stringify(item.attachmentIds),
        JSON.stringify(item.skillSelections),
        item.providerRequestId,
        item.error,
        item.createdAt,
        item.updatedAt,
      )

    this.notifyQueuedInputChange(sessionId, 'add', item)
    return item
  }

  private dispatchNextQueuedInput(sessionId: string): void {
    const row = this.db
      .prepare(
        `SELECT *
         FROM session_queued_inputs
         WHERE session_id = ? AND state = 'queued'
         ORDER BY created_at ASC
         LIMIT 1`,
      )
      .get(sessionId) as SessionQueuedInputRow | undefined

    if (!row) return

    const item = queuedInputFromRow(row)
    this.patchQueuedInput(item.id, 'dispatching')

    try {
      const session = this.getById(sessionId)
      if (!session) throw new Error(`Session not found: ${sessionId}`)
      const attachments = this.resolveAttachments(item.attachmentIds)
      const handle = this.activeHandles.get(sessionId)

      if (handle) {
        this.pendingUserAttachmentIds.set(sessionId, item.attachmentIds)
        this.pendingUserSkillSelections.set(sessionId, item.skillSelections)
        handle.sendMessage(item.text, attachments, item.skillSelections, {
          deliveryMode: 'normal',
          queuedInputId: item.id,
        })
        this.patchQueuedInput(item.id, 'sent')
        return
      }

      const provider = this.providers.get(session.providerId)
      const continuationToken = this.getContinuationToken(sessionId)
      if (!provider || !provider.supportsContinuation || !continuationToken) {
        throw new Error('Session is no longer resumable')
      }

      this.startHandle(
        session,
        item.text,
        continuationToken,
        attachments,
        item.attachmentIds,
        item.skillSelections,
      )
      this.patchQueuedInput(item.id, 'sent')
    } catch (err) {
      this.patchQueuedInput(
        item.id,
        'failed',
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  private patchQueuedInput(
    id: string,
    state: QueuedInputState,
    error: string | null = null,
  ): SessionQueuedInput | null {
    const updatedAt = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE session_queued_inputs
         SET state = ?, error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(state, error, updatedAt, id)

    const row = this.getQueuedInputRowById(id)
    if (!row) return null
    const item = queuedInputFromRow(row)
    this.notifyQueuedInputChange(item.sessionId, 'patch', item)
    return item
  }

  private getQueuedInputRowById(id: string): SessionQueuedInputRow | undefined {
    return this.db
      .prepare('SELECT * FROM session_queued_inputs WHERE id = ?')
      .get(id) as SessionQueuedInputRow | undefined
  }

  private notifyQueuedInputChange(
    sessionId: string,
    op: 'add' | 'patch',
    item: SessionQueuedInput,
  ): void {
    this.onQueuedInputPatch?.({ sessionId, op, item })
  }

  private recoverDispatchingQueuedInputs(): void {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM session_queued_inputs
         WHERE state = 'dispatching'`,
      )
      .all() as SessionQueuedInputRow[]

    const timestamp = new Date().toISOString()
    const stmt = this.db.prepare(
      `UPDATE session_queued_inputs
       SET state = 'failed',
           error = 'App restarted before this input was accepted.',
           updated_at = ?
       WHERE id = ?`,
    )

    for (const row of rows) {
      stmt.run(timestamp, row.id)
    }
  }

  private recoverStaleRunningSessions(): void {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM sessions
         WHERE status = 'running'
           AND provider_id != 'shell'`,
      )
      .all() as SessionRow[]

    for (const row of rows) {
      this.markStaleRunningSessionFailed(
        sessionSummaryFromRow(row),
        'Session marked failed because Convergence restarted before the provider process finished.',
        false,
      )
    }
  }

  private markStaleRunningSessionFailed(
    session: Session,
    reason: string,
    notify: boolean,
  ): Session {
    const timestamp = new Date().toISOString()
    const note = this.addConversationItem(session.id, {
      id: randomUUID(),
      turnId: null,
      kind: 'note',
      state: 'error',
      level: 'error',
      text: reason,
      createdAt: timestamp,
      updatedAt: timestamp,
      providerMeta: {
        providerId: session.providerId,
        providerItemId: null,
        providerEventType: 'system',
      },
    })

    this.applySessionPatch(session.id, {
      status: 'failed',
      attention: 'failed',
      activity: null,
      updatedAt: timestamp,
    })
    this.failPendingQueuedInputsForSession(session.id, reason)
    this.activeHandles.delete(session.id)
    this.closeActiveTurn(session.id, 'errored')

    if (notify) {
      this.notifySessionChange(
        session.id,
        note
          ? {
              sessionId: session.id,
              op: 'add',
              item: note,
            }
          : undefined,
      )
    }

    return this.getById(session.id) ?? session
  }

  private failPendingQueuedInputsForSession(
    sessionId: string,
    reason: string,
  ): void {
    const rows = this.db
      .prepare(
        `SELECT id
         FROM session_queued_inputs
         WHERE session_id = ?
           AND state IN ('queued', 'dispatching')`,
      )
      .all(sessionId) as Array<{ id: string }>

    for (const row of rows) {
      this.patchQueuedInput(row.id, 'failed', reason)
    }
  }

  private closeActiveTurn(
    sessionId: string,
    status: 'completed' | 'errored',
  ): void {
    if (!this.turnCapture) return
    const turnId = this.activeTurnIds.get(sessionId)
    if (!turnId) return
    const summarySource = this.firstAssistantTextForTurn(sessionId, turnId)
    this.activeTurnIds.delete(sessionId)
    this.turnCapture.endTurn({
      sessionId,
      turnId,
      status,
      summarySource,
    })
  }

  private firstAssistantTextForTurn(
    sessionId: string,
    turnId: string,
  ): string | null {
    const rows = this.db
      .prepare(
        `SELECT payload_json
         FROM session_conversation_items
         WHERE session_id = ? AND turn_id = ? AND kind = 'message'
         ORDER BY sequence ASC`,
      )
      .all(sessionId, turnId) as Array<{ payload_json: string }>
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.payload_json) as {
          actor?: string
          text?: string
        }
        if (parsed.actor === 'assistant' && typeof parsed.text === 'string') {
          return parsed.text
        }
      } catch {
        continue
      }
    }
    return null
  }

  private handleAssistantNaming(
    sessionId: string,
    item: ConversationItem,
  ): void {
    if (
      item.kind !== 'message' ||
      item.actor !== 'assistant' ||
      !item.text.trim() ||
      this.hasBeenAutoNamed(sessionId)
    ) {
      return
    }

    const assistantCount = this.getConversation(sessionId).filter(
      (entry) => entry.kind === 'message' && entry.actor === 'assistant',
    ).length

    if (assistantCount !== 1) {
      return
    }

    const session = this.getById(sessionId)
    if (!session) return

    void this.runNaming(session).catch(() => {
      // Naming failures are silent per spec.
    })
  }
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function queuedInputFromRow(row: SessionQueuedInputRow): SessionQueuedInput {
  return {
    id: row.id,
    sessionId: row.session_id,
    deliveryMode: row.delivery_mode as SessionQueuedInput['deliveryMode'],
    state: row.state as QueuedInputState,
    text: row.text,
    attachmentIds: parseJsonArray<string>(row.attachment_ids_json),
    skillSelections: parseJsonArray<SkillSelection>(row.skill_selections_json),
    providerRequestId: row.provider_request_id,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
