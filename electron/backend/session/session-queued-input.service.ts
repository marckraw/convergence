import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { SessionQueuedInputRow } from '../database/database.types'
import type { MidRunInputMode } from '../provider/provider.types'
import type { SkillSelection } from '../skills/skills.types'
import { queuedInputFromRow } from './session.pure'
import type {
  QueuedInputPatchEvent,
  QueuedInputState,
  SessionQueuedInput,
} from './session.types'

export interface SessionQueuedInputDraft {
  text: string
  attachmentIds?: string[]
  skillSelections?: SkillSelection[]
}

export type QueuedInputDeliveryMode = Extract<
  MidRunInputMode,
  'follow-up' | 'steer' | 'interrupt'
>

interface SessionQueuedInputServiceDeps {
  idFactory?: () => string
  now?: () => string
}

export class SessionQueuedInputService {
  private readonly idFactory: () => string
  private readonly now: () => string
  private onPatch: ((event: QueuedInputPatchEvent) => void) | null = null

  constructor(
    private readonly db: Database.Database,
    deps: SessionQueuedInputServiceDeps = {},
  ) {
    this.idFactory = deps.idFactory ?? (() => randomUUID())
    this.now = deps.now ?? (() => new Date().toISOString())
  }

  setPatchListener(listener: (event: QueuedInputPatchEvent) => void): void {
    this.onPatch = listener
  }

  list(sessionId: string): SessionQueuedInput[] {
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

  enqueue(
    sessionId: string,
    input: SessionQueuedInputDraft,
    deliveryMode: QueuedInputDeliveryMode,
  ): SessionQueuedInput {
    const timestamp = this.now()
    const item: SessionQueuedInput = {
      id: this.idFactory(),
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

    this.notify(item.sessionId, 'add', item)
    return item
  }

  cancel(id: string): void {
    const row = this.getRowById(id)
    if (!row) throw new Error(`Queued input not found: ${id}`)
    if (row.state !== 'queued') {
      throw new Error(`Queued input cannot be cancelled from ${row.state}`)
    }

    this.patch(id, 'cancelled')
  }

  nextQueued(sessionId: string): SessionQueuedInput | null {
    const row = this.db
      .prepare(
        `SELECT *
         FROM session_queued_inputs
         WHERE session_id = ? AND state = 'queued'
         ORDER BY created_at ASC
         LIMIT 1`,
      )
      .get(sessionId) as SessionQueuedInputRow | undefined

    return row ? queuedInputFromRow(row) : null
  }

  patch(
    id: string,
    state: QueuedInputState,
    error: string | null = null,
  ): SessionQueuedInput | null {
    const updatedAt = this.now()
    this.db
      .prepare(
        `UPDATE session_queued_inputs
         SET state = ?, error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(state, error, updatedAt, id)

    const row = this.getRowById(id)
    if (!row) return null
    const item = queuedInputFromRow(row)
    this.notify(item.sessionId, 'patch', item)
    return item
  }

  recoverDispatching(): void {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM session_queued_inputs
         WHERE state = 'dispatching'`,
      )
      .all() as SessionQueuedInputRow[]

    const timestamp = this.now()
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

  failPendingForSession(sessionId: string, reason: string): void {
    const rows = this.db
      .prepare(
        `SELECT id
         FROM session_queued_inputs
         WHERE session_id = ?
           AND state IN ('queued', 'dispatching')`,
      )
      .all(sessionId) as Array<{ id: string }>

    for (const row of rows) {
      this.patch(row.id, 'failed', reason)
    }
  }

  private getRowById(id: string): SessionQueuedInputRow | undefined {
    return this.db
      .prepare('SELECT * FROM session_queued_inputs WHERE id = ?')
      .get(id) as SessionQueuedInputRow | undefined
  }

  private notify(
    sessionId: string,
    op: 'add' | 'patch',
    item: SessionQueuedInput,
  ): void {
    this.onPatch?.({ sessionId, op, item })
  }
}
