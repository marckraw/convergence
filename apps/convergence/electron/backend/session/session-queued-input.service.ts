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
  /**
   * Account selected when this input was queued (ADR 0007, PA4). Recorded here
   * because a queued input may wait through an account switch, and the turn it
   * eventually starts belongs to the account chosen when the user wrote it.
   */
  providerAccountId?: string | null
  /**
   * Relay openers only (F9). A queued opener may wait through a whole turn
   * before it dispatches, and it must arrive exactly as the wire wrote it --
   * a `/clear` with a context block prepended is prose, not a command.
   */
  skipContextInjection?: boolean
  /**
   * The human silenced this message's wires when they sent it (F10). Kept with
   * the message because it may wait here through a whole turn, and the mute is
   * a fact about what was written rather than about the composer's state when
   * the queue finally drains.
   */
  muteRelays?: boolean
  /**
   * The delivery receipt (MAR-2759). Persisted with the input because the
   * queue is the durable half of a dispatch: the id must still name this
   * input's turn after a restart. Absent for input people typed.
   */
  dispatchId?: string | null
}

export type QueuedInputDeliveryMode = Extract<
  MidRunInputMode,
  'follow-up' | 'steer' | 'interrupt'
>

interface SessionQueuedInputServiceDeps {
  idFactory?: () => string
  now?: () => string
}

/**
 * Extracted service boundary for queued mid-run input persistence.
 *
 * SessionService delegates queue storage and patch events here so session
 * orchestration does not own SQL details for follow-up, steer, or interrupt
 * inputs.
 */
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
         ORDER BY created_at ASC, rowid ASC`,
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
      providerAccountId: input.providerAccountId ?? null,
      skipContextInjection: input.skipContextInjection === true,
      relaysMuted: input.muteRelays === true,
      dispatchId: input.dispatchId ?? null,
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
           provider_account_id,
           skip_context_injection,
           relays_muted,
           dispatch_id,
           error,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        item.providerAccountId,
        item.skipContextInjection ? 1 : 0,
        item.relaysMuted ? 1 : 0,
        item.dispatchId,
        item.error,
        item.createdAt,
        item.updatedAt,
      )

    this.notify(item.sessionId, 'add', item)
    return item
  }

  /** Returns the cancelled row, receipt included, so its ending can be told. */
  cancel(id: string): SessionQueuedInput {
    const row = this.getRowById(id)
    if (!row) throw new Error(`Queued input not found: ${id}`)
    if (row.state !== 'queued') {
      throw new Error(`Queued input cannot be cancelled from ${row.state}`)
    }

    const cancelled = this.patch(id, 'cancelled')
    if (!cancelled) throw new Error(`Queued input not found: ${id}`)
    return cancelled
  }

  /**
   * The oldest waiting input. `rowid` breaks a same-millisecond tie, because
   * an opener and its payload are enqueued in one beat and the opener must
   * go first (MAR-2759).
   */
  nextQueued(sessionId: string): SessionQueuedInput | null {
    const row = this.db
      .prepare(
        `SELECT *
         FROM session_queued_inputs
         WHERE session_id = ? AND state = 'queued'
         ORDER BY created_at ASC, rowid ASC
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

  /**
   * Fails every input still waiting on this session and returns them, receipts
   * included, so their ending can be told (MAR-2759, design P): a row that
   * ends short of a turn owes a terminal, and the caller emits it.
   */
  failPendingForSession(
    sessionId: string,
    reason: string,
  ): SessionQueuedInput[] {
    const rows = this.db
      .prepare(
        `SELECT id
         FROM session_queued_inputs
         WHERE session_id = ?
           AND state IN ('queued', 'dispatching')
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(sessionId) as Array<{ id: string }>

    const failed: SessionQueuedInput[] = []
    for (const row of rows) {
      const item = this.patch(row.id, 'failed', reason)
      if (item) failed.push(item)
    }
    return failed
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
