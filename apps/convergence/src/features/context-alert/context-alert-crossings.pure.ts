import { readContextAlert, type SessionSummary } from '@/entities/session'
import type { ContextAlertSettings } from '@/shared/lib/context-alert-settings.pure'

/**
 * What this host knows about one conversation.
 *
 * `told` is not "has been mentioned once ever": it goes back to false when the
 * figure drops under the line, which is what a compaction does, so the toast
 * follows crossings rather than the state of being over.
 *
 * `sawTurn` is "a turn of this conversation ran while we were watching". It is
 * the difference between a turn that ended in front of us and a conversation
 * that was simply sitting there, already over the line, when we started
 * looking -- or when the threshold moved under it.
 */
export interface SessionCrossingState {
  told: boolean
  sawTurn: boolean
}

/**
 * The crossing map together with the threshold its readings were taken
 * against.
 *
 * The alert travels inside the state rather than beside it because every
 * `sawTurn` in the map is only meaningful relative to one threshold: lower the
 * line and "a turn ran while we were watching *this* line" is no longer a
 * claim anyone made. Keeping the two apart is how a caller forgets to
 * re-baseline.
 */
export interface CrossingsState {
  alert: ContextAlertSettings | null
  sessions: Map<string, SessionCrossingState>
}

/** The state before anything has been observed: no readings, no threshold. */
export function initialCrossingsState(): CrossingsState {
  return { alert: null, sessions: new Map() }
}

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
  state: CrossingsState
  toTell: ContextAlertCrossing[]
}

/**
 * One toast per crossing, raised by a turn that ended under our watch
 * (MAR-3250).
 *
 * The rule is deliberately not "is over and is idle". Being idle and over is
 * the resting state of every old conversation in the app, so a threshold
 * lowered in Settings would tell the user about all of them at once -- which
 * is exactly what step 2 of this ticket's QA list says must not happen. What
 * earns a toast is a *turn*: the conversation was seen working, and then it
 * settled above the line.
 *
 * A change of the threshold therefore re-baselines every conversation
 * (`sawTurn` back to false) before any status is read in that pass. A
 * conversation that is running at that moment sets it again in the same pass,
 * so moving the line while a turn is in flight still tells when that turn
 * lands.
 *
 * Why `sawTurn` rather than "the previous status was not `completed`": Claude
 * patches the context figure *after* the turn settles
 * (`refreshContextWindowFromLogs`), so the crossing can surface an observation
 * or two later, with `completed` on both sides of it. That must still tell.
 */
export function nextCrossings(
  previous: CrossingsState,
  sessions: readonly SessionSummary[],
  alert: ContextAlertSettings,
): NextCrossings {
  const rebaseline =
    previous.alert === null || !isSameAlert(previous.alert, alert)

  const state: CrossingsState = { alert, sessions: new Map() }
  const toTell: ContextAlertCrossing[] = []

  for (const session of sessions) {
    // Sessions absent from the list are simply never copied forward, which is
    // how a deleted conversation leaves the map.
    const prior = previous.sessions.get(session.id)
    const carried = rebaseline ? false : (prior?.sawTurn ?? false)
    // Read after the re-baseline, never before: a conversation mid-turn when
    // the threshold moves must re-earn its turn immediately, not wait for the
    // next one.
    const sawTurn = carried || session.status !== 'completed'

    const contextWindow = session.contextWindow
    const reading = readContextAlert(contextWindow, alert)
    // The window is narrowed alongside the reading rather than later: `over`
    // is only ever true for an available window, and asking again below would
    // leave a branch that cannot run and a figure that would have to be
    // invented if it did. A disabled alert is never over, so it needs no
    // branch of its own here.
    if (!reading.over || contextWindow?.availability !== 'available') {
      // The re-arm. A compaction shows up here as a figure that dropped.
      state.sessions.set(session.id, { told: false, sawTurn })
      continue
    }

    if (prior?.told) {
      state.sessions.set(session.id, { told: true, sawTurn })
      continue
    }

    if (!isAtTurnBoundary(session) || !sawTurn) {
      // Either the turn has not landed yet, or no turn of this conversation
      // has run under this threshold at all. Both wait.
      state.sessions.set(session.id, { told: false, sawTurn })
      continue
    }

    state.sessions.set(session.id, { told: true, sawTurn })
    toTell.push({
      session,
      usedPercentage: contextWindow.usedPercentage,
      by: reading.by,
    })
  }

  return { state, toTell }
}

/**
 * Compared by value, never by identity: the settings store hands out a fresh
 * object on every broadcast, so an identity check would re-baseline -- and
 * silence a real crossing -- every time an unrelated setting was saved.
 */
function isSameAlert(
  a: ContextAlertSettings,
  b: ContextAlertSettings,
): boolean {
  return (
    a.enabled === b.enabled && a.percent === b.percent && a.tokens === b.tokens
  )
}

/**
 * A turn has ended. `running` is mid-turn; `answered` and `failed` are states
 * a turn passes through on the way to settling, and telling on them would
 * either speak twice about one turn or speak about a turn that did not finish.
 */
function isAtTurnBoundary(session: SessionSummary): boolean {
  return session.status === 'completed'
}
