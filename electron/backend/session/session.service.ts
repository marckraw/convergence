import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { SessionRow } from '../database/database.types'
import type { ProviderRegistry } from '../provider/provider-registry'
import type {
  SessionHandle,
  TranscriptEntry,
  SessionStatus,
  AttentionState,
  SessionContextWindow,
  ActivitySignal,
} from '../provider/provider.types'
import {
  sessionFromRow,
  type Session,
  type CreateSessionInput,
} from './session.types'

export class SessionService {
  private activeHandles = new Map<string, SessionHandle>()
  private onUpdate: ((session: Session) => void) | null = null

  constructor(
    private db: Database.Database,
    private providers: ProviderRegistry,
  ) {}

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
           working_directory
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
  }

  start(id: string, message: string): void {
    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)

    this.startHandle(session, message, this.getContinuationToken(id))
  }

  sendMessage(id: string, text: string): void {
    const handle = this.activeHandles.get(id)
    if (handle) {
      handle.sendMessage(text)
      return
    }

    const session = this.getById(id)
    if (!session) throw new Error(`Session not found: ${id}`)

    const provider = this.providers.get(session.providerId)
    if (!provider) throw new Error(`Provider not found: ${session.providerId}`)

    const continuationToken = this.getContinuationToken(id)
    if (provider.supportsContinuation && continuationToken) {
      this.startHandle(session, text, continuationToken)
      return
    }

    if (provider.supportsContinuation) {
      throw new Error(
        `Session cannot be resumed: missing continuation state. Start a new session.`,
      )
    }

    throw new Error(`Session not active: ${id}`)
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

    const transcript = JSON.parse(row.transcript) as TranscriptEntry[]
    transcript.push(entry)

    this.db
      .prepare(
        "UPDATE sessions SET transcript = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(JSON.stringify(transcript), id)

    this.notifyUpdate(id)
  }

  private updateField(id: string, field: string, value: string): void {
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
  ): void {
    const provider = this.providers.get(session.providerId)
    if (!provider) throw new Error(`Provider not found: ${session.providerId}`)

    const handle = provider.start({
      sessionId: session.id,
      workingDirectory: session.workingDirectory,
      initialMessage,
      model: session.model,
      effort: session.effort,
      continuationToken,
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
      this.updateField(session.id, 'attention', attention)
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
