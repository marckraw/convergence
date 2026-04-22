import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type {
  ConversationItemRow,
  SessionRow,
} from '../database/database.types'
import type { ProviderRegistry } from '../provider/provider-registry'
import type {
  Attachment,
  SessionHandle,
  SessionStatus,
  AttentionState,
  ActivitySignal,
} from '../provider/provider.types'
import type { AttachmentsService } from '../attachments/attachments.service'
import {
  sessionSummaryFromRow,
  type Session,
  type SessionSummary,
  type CreateSessionInput,
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

type UserMessageDraft = Extract<
  ConversationItem,
  { kind: 'message'; actor: 'user' }
>
type UserMessageDraftInput = Omit<UserMessageDraft, 'sessionId' | 'sequence'>

export interface SendMessageInput {
  text: string
  attachmentIds?: string[]
}

export interface SessionNamer {
  generateName(
    session: SessionSummary,
    conversation: ConversationItem[],
  ): Promise<string | null>
}

export class SessionService {
  private activeHandles = new Map<string, SessionHandle>()
  private onSummaryUpdate: ((summary: SessionSummary) => void) | null = null
  private onConversationPatch:
    | ((event: ConversationPatchEvent) => void)
    | null = null
  private attachments: AttachmentsService | null = null
  private namer: SessionNamer | null = null

  constructor(
    private db: Database.Database,
    private providers: ProviderRegistry,
  ) {}

  setAttachmentsService(service: AttachmentsService): void {
    this.attachments = service
  }

  setNamer(namer: SessionNamer): void {
    this.namer = namer
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

  async regenerateName(id: string): Promise<void> {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)
    await this.runNaming(session)
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
           fork_strategy
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    this.startHandle(
      session,
      input.text,
      this.getContinuationToken(id),
      attachments,
      input.attachmentIds,
    )
  }

  async sendMessage(id: string, input: SendMessageInput): Promise<void> {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)

    if (session.archivedAt) {
      this.updateArchiveState(id, null)
    }

    await this.rebindDraftAttachments(id, input.attachmentIds)
    const attachments = this.resolveAttachments(input.attachmentIds)

    const handle = this.activeHandles.get(id)
    if (handle) {
      this.pendingUserAttachmentIds.set(id, input.attachmentIds ?? [])
      handle.sendMessage(input.text, attachments)
      return
    }

    const provider = this.providers.get(session.providerId)
    if (!provider) throw new Error(`Provider not found: ${session.providerId}`)

    const continuationToken = this.getContinuationToken(id)
    if (provider.supportsContinuation && continuationToken) {
      this.startHandle(
        session,
        input.text,
        continuationToken,
        attachments,
        input.attachmentIds,
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

  private pendingUserAttachmentIds = new Map<string, string[]>()

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
    if (!handle) throw new Error(`Session not active: ${id}`)
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

    const nextStatus = patch.status ?? (row.status as SessionStatus)
    const nextAttention =
      patch.attention ?? (row.attention as AttentionState | undefined)
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

  private updateAttention(id: string, attention: AttentionState): void {
    const row = this.getRowById(id)
    if (!row) {
      return
    }

    if (
      row.archived_at &&
      (attention === 'needs-approval' || attention === 'needs-input')
    ) {
      this.db
        .prepare(
          "UPDATE sessions SET attention = ?, archived_at = NULL, updated_at = datetime('now') WHERE id = ?",
        )
        .run(attention, id)
      this.notifySessionChange(id)
      return
    }

    this.updateField(id, 'attention', attention)
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
  ): void {
    const provider = this.providers.get(session.providerId)
    if (!provider) throw new Error(`Provider not found: ${session.providerId}`)

    if (initialAttachmentIds && initialAttachmentIds.length > 0) {
      this.pendingUserAttachmentIds.set(session.id, initialAttachmentIds)
    }

    const handle = provider.start({
      sessionId: session.id,
      workingDirectory: session.workingDirectory,
      initialMessage,
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
    } else if (status === 'completed') {
      const summary = this.getSummaryById(sessionId)
      if (
        summary &&
        !this.providers.get(summary.providerId)?.supportsContinuation
      ) {
        this.activeHandles.delete(sessionId)
      }
    }
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
