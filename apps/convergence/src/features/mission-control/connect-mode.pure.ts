/**
 * Drawing a connection without a mouse drag (R10).
 *
 * A drag from an edge handle is the fast gesture, but it is the only one a
 * trackpad-averse or keyboard-driven person cannot make, and "draw a
 * connection" is the primary act of this whole view. So the same result is
 * reachable by clicking a source then a target, and by focusing a card and
 * pressing Enter twice.
 *
 * Both paths share THIS state machine rather than each carrying their own,
 * because two implementations of "which card did they pick first" is two
 * chances for the keyboard route to quietly stop matching the mouse one.
 */
export type ConnectModeState =
  | { kind: 'off' }
  /** Armed, waiting for the conversation whose reply will be carried. */
  | { kind: 'awaiting-source' }
  /** Source chosen; the next card picked becomes the recipient. */
  | { kind: 'awaiting-target'; sourceSessionId: string }

export const CONNECT_MODE_OFF: ConnectModeState = { kind: 'off' }

/** What a pick produced: nothing yet, or a connection to open as a draft. */
export interface ConnectModeResult {
  state: ConnectModeState
  /** Set only on the pick that completes a pair. */
  drawn: { sourceSessionId: string; targetSessionId: string } | null
}

/** Turning the toolbar's Connect on, or off again. */
export function toggleConnectMode(state: ConnectModeState): ConnectModeState {
  return state.kind === 'off' ? { kind: 'awaiting-source' } : CONNECT_MODE_OFF
}

/**
 * A card was picked — by click or by Enter, the machine cannot tell and must
 * not care.
 *
 * Picking the source twice CANCELS the pick rather than drawing a self-loop:
 * a wire that listens to its own session is refused by the engine (R6), so
 * offering it as a gesture would teach a shape that always fails. Clicking
 * the same card again reads as "no, not that one".
 */
export function pickConnectCard(
  state: ConnectModeState,
  sessionId: string,
): ConnectModeResult {
  if (state.kind === 'off') return { state, drawn: null }

  if (state.kind === 'awaiting-source') {
    return {
      state: { kind: 'awaiting-target', sourceSessionId: sessionId },
      drawn: null,
    }
  }

  if (sessionId === state.sourceSessionId) {
    return { state: { kind: 'awaiting-source' }, drawn: null }
  }

  // The pair is complete. Connect mode ends with it: the inspector is now the
  // thing to look at, and a mode still armed behind an open draft would take
  // the next click meant for the panel.
  return {
    state: CONNECT_MODE_OFF,
    drawn: {
      sourceSessionId: state.sourceSessionId,
      targetSessionId: sessionId,
    },
  }
}

/** Escape: back out one step, then out of the mode. */
export function cancelConnectMode(state: ConnectModeState): ConnectModeState {
  return state.kind === 'awaiting-target'
    ? { kind: 'awaiting-source' }
    : CONNECT_MODE_OFF
}

/**
 * The footer sentence, which is the only thing telling the person what the
 * next click will do.
 *
 * Names the chosen card rather than saying "the source", because "Fable
 * selected" is checkable at a glance and "source selected" is not.
 */
export function connectModeHint(
  state: ConnectModeState,
  resolveName: (sessionId: string) => string | null,
): string | null {
  if (state.kind === 'off') return null
  if (state.kind === 'awaiting-source') {
    return 'Choose the conversation that finishes. Esc cancels.'
  }
  const name = resolveName(state.sourceSessionId) ?? 'That conversation'
  return `${name} selected. Choose the recipient on the canvas or in the list. Esc cancels.`
}
