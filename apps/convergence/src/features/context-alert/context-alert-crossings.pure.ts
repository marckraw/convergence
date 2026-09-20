import { readContextAlert, type SessionSummary } from '@/entities/session'
import type { ContextAlertSettings } from '@/shared/lib/context-alert-settings.pure'

/**
 * Whether a conversation still owes a toast (`armed`) or has already had one
 * for its current climb (`told`).
 */
export type CrossingState = 'armed' | 'told'

/**
 * A conversation to raise a toast about, with the figures the toast needs.
 *
 * The reading travels with the session rather than being recomputed by the
 * caller: `by` and `usedPercentage` were both decided here, and a second
 * derivation at the toast could name a different limit than the dot's popover
 * for the same conversation.
 */
export interface ContextAlertCrossing {
  session: SessionSummary
  usedPercentage: number
  by: 'percent' | 'tokens'
}

export interface NextCrossings {
  state: Map<string, CrossingState>
  toTell: ContextAlertCrossing[]
}

/**
 * One toast per crossing, raised at the turn boundary (MAR-3250).
 *
 * `told` is not "this session has been mentioned once ever": it is reset by the
 * figure dropping back under the threshold, which is what a compaction does.
 * So the toast follows crossings of the line rather than the state of being
 * over it, and a conversation that is compacted and fills up again is told
 * again.
 *
 * `firstObservation` is the caller's answer to "could this list still contain
 * conversations that were already over the line before I was watching?" Those
 * are recorded as `told` without being told, because a restart must not raise
 * one toast per old conversation.
 */
export function nextCrossings(
  previous: ReadonlyMap<string, CrossingState>,
  sessions: readonly SessionSummary[],
  alert: ContextAlertSettings,
  firstObservation: boolean,
): NextCrossings {
  const state = new Map<string, CrossingState>()
  const toTell: ContextAlertCrossing[] = []

  for (const session of sessions) {
    // Sessions absent from the list are simply never copied forward, which is
    // how a deleted conversation leaves the map.
    if (!alert.enabled) {
      state.set(session.id, 'armed')
      continue
    }

    const contextWindow = session.contextWindow
    const reading = readContextAlert(contextWindow, alert)
    // The window is narrowed alongside the reading rather than later: `over`
    // is only ever true for an available window, and asking again below would
    // leave a branch that cannot run and a figure that would have to be
    // invented if it did.
    if (!reading.over || contextWindow?.availability !== 'available') {
      // The re-arm. A compaction shows up here as a figure that dropped.
      state.set(session.id, 'armed')
      continue
    }

    if (firstObservation) {
      state.set(session.id, 'told')
      continue
    }

    const wasTold = previous.get(session.id) === 'told'
    if (wasTold) {
      state.set(session.id, 'told')
      continue
    }

    if (!isAtTurnBoundary(session)) {
      // Over the line mid-turn. Nothing is said yet -- the figure is still
      // moving, and the moment to speak is when the answer lands.
      state.set(session.id, previous.get(session.id) ?? 'armed')
      continue
    }

    state.set(session.id, 'told')
    toTell.push({
      session,
      usedPercentage: contextWindow.usedPercentage,
      by: reading.by,
    })
  }

  return { state, toTell }
}

/**
 * A turn has ended. `running` is mid-turn; `answered` and `failed` are states
 * a turn passes through on the way to settling, and telling on them would
 * either speak twice about one turn or speak about a turn that did not finish.
 */
function isAtTurnBoundary(session: SessionSummary): boolean {
  return session.status === 'completed'
}
