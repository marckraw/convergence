import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { SessionRow } from '../database/database.types'
import type { ProviderRegistry } from '../provider/provider-registry'
import type {
  SessionHandle,
  TranscriptEntry,
  SessionStatus,
  AttentionState,
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

  getById(id: string): Session | null {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as SessionRow | undefined

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

    const provider = this.providers.get(session.providerId)
    if (!provider) throw new Error(`Provider not found: ${session.providerId}`)

    const handle = provider.start({
      sessionId: id,
      workingDirectory: session.workingDirectory,
      initialMessage: message,
      model: session.model,
      effort: session.effort,
    })

    this.activeHandles.set(id, handle)

    handle.onTranscriptEntry((entry: TranscriptEntry) => {
      this.appendTranscript(id, entry)
    })

    handle.onStatusChange((status: SessionStatus) => {
      this.updateField(id, 'status', status)
      if (status === 'failed') {
        this.activeHandles.delete(id)
      } else if (status === 'completed' && !provider.supportsContinuation) {
        this.activeHandles.delete(id)
      }
    })

    handle.onAttentionChange((attention: AttentionState) => {
      this.updateField(id, 'attention', attention)
    })
  }

  sendMessage(id: string, text: string): void {
    const handle = this.activeHandles.get(id)
    if (!handle) throw new Error(`Session not active: ${id}`)
    handle.sendMessage(text)
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

  private notifyUpdate(id: string): void {
    if (this.onUpdate) {
      const session = this.getById(id)
      if (session) this.onUpdate(session)
    }
  }
}
