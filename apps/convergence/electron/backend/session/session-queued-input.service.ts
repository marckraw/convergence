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
  /** The row this is a second attempt at (MAR-2971, R2). */
  redeliveredFrom?: string | null
  /**
   * The place in line this input already had, when it has one (MAR-2971 lap
   * 4). Only a re-attempt passes it: everything else is joining the back of
   * the line, and its `rowid` says where that is.
   */
  queuePosition?: number
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
         ORDER BY queue_position ASC`,
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
      redeliveredFrom: input.redeliveredFrom ?? null,
      endingToldAt: null,
      error: null,
      // Filled from `rowid` right after the insert, or inherited by a
      // re-attempt. Zero is never read: the update below runs in the same
      // transaction as the insert.
      queuePosition: input.queuePosition ?? 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const insert = this.db.prepare(
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
           redelivered_from,
           queue_position,
           error,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    // Its own place in line, from `rowid`, unless it inherited one. Two
    // statements in ONE transaction: every reader orders by `queue_position`
    // alone, and SQLite sorts NULLs first, so a row that got its insert but
    // not its position would jump the whole queue. `rowid` is the insertion
    // order, which is design X's order -- an opener is inserted before its
    // own payload, and two wires firing into one station keep each opener
    // next to the payload it clears for.
    this.db.transaction(() => {
      insert.run(
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
        item.redeliveredFrom,
        item.queuePosition === 0 ? null : item.queuePosition,
        item.error,
        item.createdAt,
        item.updatedAt,
      )
      if (item.queuePosition === 0) {
        this.db
          .prepare(
            'UPDATE session_queued_inputs SET queue_position = rowid WHERE id = ?',
          )
          .run(item.id)
      }
    })()
    const stored = this.getRowById(item.id)
    if (stored) item.queuePosition = stored.queue_position ?? 0

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
   * and the mute -- and points back at its predecessor.
   *
   * It carries a NEW receipt, not the old one. Lap 1 reused the id, reading
   * "the same errand" as "the same receipt"; the two come apart the moment
   * the engine has already been told the `failed` ending, which is every
   * case but the boot recovery. A released id names a receipt nobody holds,
   * so the next settle mints a brand new flow run and the crew's loop is
   * orphaned mid-round -- and a muted opener's settle would read as work and
   * fire the wires on a `/clear`. The caller tells the engine about the
   * handover instead, and the engine re-opens the errand on the original
   * run. A row whose first attempt carried no receipt (input a person
   * typed) still carries none.
   *
   * The fresh row KEEPS its predecessor's place in line -- it inherits its
   * `queue_position` (MAR-2971 lap 4, Finding C). Deliver now re-attempts an
   * errand; it does not resubmit it, and an errand does not lose its turn by
   * having failed. The sharp case is an opener: its payload is still queued
   * ahead of it, so a row sent to the back would have the payload run FIRST
   * and the `/clear` arrive after the work it was supposed to clear for.
   *
   * The two rows briefly share a position, and nothing has to break that
   * tie: the predecessor is `failed`, so it is never in the same ordered set
   * as the row that replaced it.
   */
  redeliver(id: string): {
    input: SessionQueuedInput
    /** The receipt the first attempt carried, or null if it carried none. */
    fromDispatchId: string | null
  } {
    const row = this.getRowById(id)
    if (!row) throw new Error(`Queued input not found: ${id}`)
    if (row.state !== 'failed') {
      throw new Error(`Queued input cannot be redelivered from ${row.state}`)
    }

    const previous = queuedInputFromRow(row)
    const fresh = this.enqueue(
      previous.sessionId,
      {
        text: previous.text,
        attachmentIds: previous.attachmentIds,
        skillSelections: previous.skillSelections,
        providerAccountId: previous.providerAccountId,
        skipContextInjection: previous.skipContextInjection,
        muteRelays: previous.relaysMuted,
        queuePosition: previous.queuePosition,
        // Its predecessor's PLACE, not its arrival time: an errand does not
        // go to the back of the line for having failed, and an opener that
        // did would arrive behind the payload it clears for. The new row's
        // `created_at` is honestly now -- it really was queued now -- and
        // the place is the column.

        // A NEW receipt, never the old one (R2 as amended in lap 2). By the
        // time a row is failed the engine has usually already been told the
        // `failed` ending and released the baton, so the old id names a
        // receipt nobody holds: the next settle would mint a brand new flow
        // run and orphan the crew's loop. The engine is told about the
        // handover separately and re-opens the errand on the original run.
        dispatchId: previous.dispatchId === null ? null : this.idFactory(),
        redeliveredFrom: previous.id,
      },
      previous.deliveryMode,
    )
    return { input: fresh, fromDispatchId: previous.dispatchId }
  }

  /**
   * The next input this session will send: the one earliest in line.
   *
   * One number, and the same one every other reader uses (MAR-2971 lap 4).
   * Two earlier attempts at this ordering were proxies for it and each broke
   * at an input where the proxy and the question disagreed. `created_at`
   * cannot answer it, because an opener and its payload are enqueued in one
   * beat and share a millisecond. `relays_muted DESC` -- "a muted row is an
   * opener, openers lead" -- was worse: the mute is a flag people set on
   * their own follow-ups, and when two wires fire into one busy station the
   * beat holds O1,P1,O2,P2, which that rule drains O1,O2,P1,P2, running the
   * second payload with no `/clear` in front of it.
   *
   * `queue_position` is the fact itself, so there is nothing left to infer
   * and no second tie-break to get wrong.
   */
  nextQueued(sessionId: string): SessionQueuedInput | null {
    const row = this.db
      .prepare(
        `SELECT *
         FROM session_queued_inputs
         WHERE session_id = ? AND state = 'queued'
         ORDER BY queue_position ASC
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
         ORDER BY queue_position ASC`,
      )
      .all(sessionId) as Array<{ id: string }>

    const failed: SessionQueuedInput[] = []
    for (const row of rows) {
      const item = this.patch(row.id, 'failed', reason)
      if (item) failed.push(item)
    }
    return failed
  }

  /**
   * Stamps that this row's receipt has been told an ending (MAR-2971).
   *
   * Called by the paths that actually emit a terminal, never by
   * `recoverDispatching`: that one rewrites the state at boot and announces
   * nothing, so its rows are still owed and a later dismissal is the first
   * and only ending they get. Without the stamp the two kinds of `failed`
   * row are indistinguishable and a dismissal would announce a second
   * ending for an id the engine has already released.
   */
  markEndingTold(ids: readonly string[]): void {
    if (ids.length === 0) return
    const stamp = this.db.prepare(
      `UPDATE session_queued_inputs
       SET ending_told_at = ?
       WHERE id = ? AND ending_told_at IS NULL`,
    )
    const timestamp = this.now()
    for (const id of ids) stamp.run(timestamp, id)
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
