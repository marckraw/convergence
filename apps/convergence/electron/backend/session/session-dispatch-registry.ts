import { randomUUID } from 'crypto'

/**
 * One send that has left its caller but has not yet reached a provider
 * (MAR-2550).
 *
 * Identity only, deliberately: it exists so that overlapping sends on one
 * session are separable at all. What a send carries — its account, its
 * attachments, its skills — is per-dispatch state that today still lives in
 * one-deep per-session slots (MAR-2539), and this is the record those fields
 * belong on when that is fixed.
 */
export interface SessionDispatch {
  readonly id: string
  readonly sessionId: string
}

/**
 * Registry of the sends a session has begun and not yet handed to a provider
 * (MAR-2550).
 *
 * The send path is asynchronous: it awaits attachment rebinding before it
 * spawns or resumes anything. For the width of that await the session is
 * invisible to everything that asks whether it is busy — the status is not
 * `running` yet because no process exists, and no handle is registered because
 * the handle is what the send is on its way to create. A guard that consults
 * only those two signals sees an idle session and lets work through.
 *
 * The same window has now produced four defects: run 20's opener/payload race,
 * run 22's relay mute carrier, MAR-2539's one-deep per-turn slots, and a model
 * change accepted between a dispatch reading the row and the process spawning
 * on it. Each was closed at one caller. This is the signal none of them had —
 * a session says so while a send is in flight, and the callers that must not
 * run then can simply ask.
 *
 * A registry rather than a flag because a session can have more than one send
 * in flight, and the last one to settle must not clear the marker for the
 * others.
 */
export class SessionDispatchRegistry {
  private readonly inFlight = new Map<string, Set<SessionDispatch>>()

  /**
   * Marks a send as in flight. Call synchronously, before the send path's
   * first `await`; the returned record must be handed back to `settle`.
   */
  begin(sessionId: string): SessionDispatch {
    const dispatch: SessionDispatch = { id: randomUUID(), sessionId }
    const existing = this.inFlight.get(sessionId)
    if (existing) {
      existing.add(dispatch)
    } else {
      this.inFlight.set(sessionId, new Set([dispatch]))
    }
    return dispatch
  }

  /**
   * Ends a send, whether it reached a provider or failed on the way. Safe to
   * call twice; the second call is a no-op.
   */
  settle(dispatch: SessionDispatch): void {
    const dispatches = this.inFlight.get(dispatch.sessionId)
    if (!dispatches) return
    dispatches.delete(dispatch)
    if (dispatches.size === 0) {
      this.inFlight.delete(dispatch.sessionId)
    }
  }

  /** Whether any send for this session is still on its way to a provider. */
  isDispatching(sessionId: string): boolean {
    return (this.inFlight.get(sessionId)?.size ?? 0) > 0
  }
}
