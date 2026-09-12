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

  /** One row by id, whatever its state, or null. */
  get(id: string): SessionQueuedInput | null {
    const row = this.getRowById(id)
    return row ? queuedInputFromRow(row) : null
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

  /**
   * Returns the cancelled row, receipt included, so its ending can be told.
   *
   * From `queued` OR `failed` (R3, MAR-2971). A failed row used to be a dead
   * end: the card rendered a DISABLED ✕, so the four rows Marcin was left
   * with on 2026-09-11 could be neither delivered nor dismissed — the "weird
   * indefinite state" he reported. A row on the wire (`dispatching`) still
   * refuses, because its turn may yet answer and dismissing it would be a
   * lie about work already in flight.
   */
  cancel(id: string): SessionQueuedInput {
    const row = this.getRowById(id)
    if (!row) throw new Error(`Queued input not found: ${id}`)
    if (row.state !== 'queued' && row.state !== 'failed') {
      throw new Error(`Queued input cannot be cancelled from ${row.state}`)
    }

    const cancelled = this.patch(id, 'cancelled')
    if (!cancelled) throw new Error(`Queued input not found: ${id}`)
    return cancelled
  }

  /**
   * Deliver now (R2, MAR-2971): a failed row's work, queued again as a fresh
   * row waiting for the next turn.
   *
   * A new row rather than a revived one, on purpose. The failed row is the
   * record that an attempt happened and how it ended; rewriting it would
   * erase the only evidence of the first try, and the ledger reads these
   * rows. The new row carries the payload exactly as the wire wrote it --
   * text, attachments, skills, the account chosen then, the injection bypass
   * and the mute -- and the SAME `dispatchId`, because it is a second attempt
   * at one errand, not a second errand: delivering it settles the hop the
   * first attempt left owed.
   */
  redeliver(id: string): SessionQueuedInput {
    const row = this.getRowById(id)
    if (!row) throw new Error(`Queued input not found: ${id}`)
    if (row.state !== 'failed') {
      throw new Error(`Queued input cannot be redelivered from ${row.state}`)
    }

    const previous = queuedInputFromRow(row)
    return this.enqueue(
      previous.sessionId,
      {
        text: previous.text,
        attachmentIds: previous.attachmentIds,
        skillSelections: previous.skillSelections,
        providerAccountId: previous.providerAccountId,
        skipContextInjection: previous.skipContextInjection,
        muteRelays: previous.relaysMuted,
        dispatchId: previous.dispatchId,
      },
      previous.deliveryMode,
    )
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
   * Fails every input this session ATTEMPTED to deliver and returns them,
   * receipts included, so their ending can be told (MAR-2759, design P): a
   * row that ends short of a turn owes a terminal, and the caller emits it.
   *
   * Attempted, and only attempted — `dispatching`, never `queued` (R1,
   * MAR-2971). A `queued` row is one nothing has tried yet; the turn ahead of
   * it ending is news about that turn, not about this row, and the next turn
   * drains it in order. Four relay terminals were lost on 2026-09-11 because
   * this swept the whole queue: the rows behind a stopped turn were marked
   * `failed` with "The turn this input was waiting behind failed", their hops
   * were stamped `failed`, and the loop recovered only because a human
   * re-pasted four messages by hand.
   *
   * The name carries the rule: there is no method here that fails a row
   * nobody attempted, so the old sweep cannot be written back by accident.
   */
  failAttemptedForSession(
    sessionId: string,
    reason: string,
  ): SessionQueuedInput[] {
    const rows = this.db
      .prepare(
        `SELECT id
         FROM session_queued_inputs
         WHERE session_id = ?
           AND state = 'dispatching'
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
