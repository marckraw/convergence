/**
 * The quiet send, in the composer (F10, MAR-2537).
 *
 * The toggle only exists for a session something actually leaves. A control
 * that silences nothing is noise on every other composer in the app, so the
 * absence of wires is the absence of the button — not a disabled one.
 */

/** The shape of a wire this feature needs; the rest of a relay is not its business. */
export interface OutgoingRelayFact {
  sourceSessionId: string
  armed: boolean
}

/**
 * Armed wires leaving this session — the number the toggle is about.
 *
 * Armed only. A disarmed wire will not fire whatever the human does, so
 * counting it would offer to silence something already silent.
 */
export function countArmedOutgoingRelays(
  relays: readonly OutgoingRelayFact[],
  sessionId: string | null | undefined,
): number {
  if (!sessionId) return 0
  return relays.filter(
    (relay) => relay.armed && relay.sourceSessionId === sessionId,
  ).length
}

/** The toggle's own sentence, so a switched-on control is never a mystery. */
export function relayMuteTitle(muted: boolean, armedOutgoing: number): string {
  const wires = armedOutgoing === 1 ? '1 wire' : `${armedOutgoing} wires`
  return muted
    ? `This send will not fire the ${wires} leaving this session. It resets after you send.`
    : `Sending will fire the ${wires} leaving this session. Switch this on to send quiet, once.`
}
