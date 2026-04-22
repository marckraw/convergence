import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { SessionRow } from '../database/database.types'
import type { ProviderRegistry } from '../provider/provider-registry'
import type {
  Attachment,
  SessionHandle,
  TranscriptEntry,
  SessionStatus,
  AttentionState,
  SessionContextWindow,
  ActivitySignal,
} from '../provider/provider.types'
import type { AttachmentsService } from '../attachments/attachments.service'
import {
  sessionFromRow,
  type Session,
  type CreateSessionInput,
} from './session.types'

export interface SendMessageInput {
  text: string
  attachmentIds?: string[]
}

export interface SessionNamer {
  generateName(session: Session): Promise<string | null>
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
  private onUpdate: ((session: Session) => void) | null = null
  private attachments: AttachmentsService | null = null
  private namer: SessionNamer | null = null
  private attentionObserver: SessionAttentionObserver | null = null

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
    this.notifyUpdate(id)
    return this.getById(id)!
  }

  async regenerateName(id: string): Promise<void> {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)
    await this.runNaming(session)
  }

  private async runNaming(session: Session): Promise<void> {
    if (!this.namer) return
    const title = await this.namer.generateName(session)
    if (!title) return
    this.db
      .prepare(
        "UPDATE sessions SET name = ?, name_auto_generated = 1, updated_at = datetime('now') WHERE id = ?",
      )
      .run(title, session.id)
    this.notifyUpdate(session.id)
  }

  private hasBeenAutoNamed(id: string): boolean {
    const row = this.db
      .prepare('SELECT name_auto_generated FROM sessions WHERE id = ?')
      .get(id) as { name_auto_generated: number } | undefined
    return (row?.name_auto_generated ?? 0) === 1
  }

  setUpdateListener(listener: (session: Session) => void): void {
    this.onUpdate = listener
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

    return this.getById(id)!
  }

  getByProjectId(projectId: string): Session[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC',
      )
      .all(projectId) as SessionRow[]

    return rows.map(sessionFromRow)
  }

  getAll(): Session[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY created_at DESC')
      .all() as SessionRow[]

    return rows.map(sessionFromRow)
  }

  getById(id: string): Session | null {
    const row = this.getRowById(id)

    return row ? sessionFromRow(row) : null
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

  private appendTranscript(id: string, entry: TranscriptEntry): void {
    const row = this.db
      .prepare('SELECT transcript FROM sessions WHERE id = ?')
      .get(id) as { transcript: string } | undefined
    if (!row) return

    let annotated: TranscriptEntry = entry
    if (entry.type === 'user') {
      const pending = this.pendingUserAttachmentIds.get(id)
      if (pending && pending.length > 0) {
        annotated = { ...entry, attachmentIds: pending }
      }
      this.pendingUserAttachmentIds.delete(id)
    }

    const transcript = JSON.parse(row.transcript) as TranscriptEntry[]
    const priorAssistantCount = transcript.filter(
      (item) => item.type === 'assistant',
    ).length
    transcript.push(annotated)

    this.db
      .prepare(
        "UPDATE sessions SET transcript = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(JSON.stringify(transcript), id)

    this.notifyUpdate(id)

    if (
      entry.type === 'assistant' &&
      priorAssistantCount === 0 &&
      !this.hasBeenAutoNamed(id)
    ) {
      const session = this.getById(id)
      if (session) {
        void this.runNaming(session).catch(() => {
          // Naming failures are silent per spec.
        })
      }
    }
  }

  private updateField(id: string, field: string, value: string | null): void {
    this.db
      .prepare(
        `UPDATE sessions SET ${field} = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(value, id)

    this.notifyUpdate(id)
  }

  private updateContextWindow(
    id: string,
    contextWindow: SessionContextWindow,
  ): void {
    this.db
      .prepare(
        "UPDATE sessions SET context_window = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(JSON.stringify(contextWindow), id)

    this.notifyUpdate(id)
  }

  private updateActivity(id: string, activity: ActivitySignal): void {
    this.db
      .prepare(
        "UPDATE sessions SET activity = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(activity, id)

    this.notifyUpdate(id)
  }

  private updateArchiveState(id: string, archivedAt: string | null): void {
    this.db
      .prepare(
        "UPDATE sessions SET archived_at = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(archivedAt, id)

    this.notifyUpdate(id)
  }

  private updateAttention(id: string, attention: AttentionState): void {
    const row = this.getRowById(id)
    if (!row) {
      return
    }

    const prevAttention = row.attention as AttentionState

    if (
      row.archived_at &&
      (attention === 'needs-approval' || attention === 'needs-input')
    ) {
      this.db
        .prepare(
          "UPDATE sessions SET attention = ?, archived_at = NULL, updated_at = datetime('now') WHERE id = ?",
        )
        .run(attention, id)
      this.notifyUpdate(id)
      this.notifyAttention(id, prevAttention, attention)
      return
    }

    this.updateField(id, 'attention', attention)
    this.notifyAttention(id, prevAttention, attention)
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

  private notifyUpdate(id: string): void {
    if (this.onUpdate) {
      const session = this.getById(id)
      if (session) this.onUpdate(session)
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

  private updateContinuationToken(id: string, token: string): void {
    this.db
      .prepare('UPDATE sessions SET continuation_token = ? WHERE id = ?')
      .run(token, id)
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

    handle.onTranscriptEntry((entry: TranscriptEntry) => {
      this.appendTranscript(session.id, entry)
    })

    handle.onStatusChange((status: SessionStatus) => {
      this.updateField(session.id, 'status', status)
      if (status !== 'running') {
        this.updateActivity(session.id, null)
      }
      if (status === 'failed') {
        this.activeHandles.delete(session.id)
      } else if (status === 'completed' && !provider.supportsContinuation) {
        this.activeHandles.delete(session.id)
      }
    })

    handle.onAttentionChange((attention: AttentionState) => {
      this.updateAttention(session.id, attention)
    })

    handle.onContinuationToken((token: string) => {
      if (token.trim()) {
        this.updateContinuationToken(session.id, token)
      }
    })

    handle.onContextWindowChange((contextWindow: SessionContextWindow) => {
      this.updateContextWindow(session.id, contextWindow)
    })

    handle.onActivityChange((activity: ActivitySignal) => {
      this.updateActivity(session.id, activity)
    })
  }
}
