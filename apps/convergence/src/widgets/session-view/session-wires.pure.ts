/**
 * The wires leaving a session, as the session itself can see them (F11,
 * MAR-2538).
 *
 * Read-only by design. Mission Control is where wires are drawn, armed and
 * deleted; from inside a session the only question is "does anything happen
 * when I finish, and what". Two places able to edit the same wire is two
 * places able to disagree about it.
 */

/** The part of a wire this surface needs to decide what to show. */
export interface OutgoingWireFact {
  sourceSessionId: string
  armed: boolean
}

/**
 * Wires that leave this session, in the order the store holds them.
 *
 * Outgoing only. A wire pointing AT this session fires when somebody else
 * finishes, so it answers a different question than the one this surface asks,
 * and folding the two together would make the count mean nothing.
 */
export function selectOutgoingWires<T extends OutgoingWireFact>(
  relays: readonly T[],
  sessionId: string | null | undefined,
): T[] {
  if (!sessionId) return []
  return relays.filter((relay) => relay.sourceSessionId === sessionId)
}

export function formatSessionWireCount(total: number): string {
  return `${total} wire${total === 1 ? '' : 's'}`
}

/**
 * What the chip says when you hover it.
 *
 * Disarmed wires are counted in the total on purpose: a session with wires
 * that are all switched off is not an unwired session, and hiding them here
 * would make the switch invisible from the only screen the user is looking at.
 * The sentence then has to say so, or the count is a promise the wires are not
 * keeping.
 */
export function formatSessionWireSummary(total: number, armed: number): string {
  const wires = formatSessionWireCount(total)
  const leave = total === 1 ? 'leaves' : 'leave'
  if (total === 0) return 'Nothing leaves this session.'
  if (armed === 0) {
    return total === 1
      ? `${wires} ${leave} this session, and it is disarmed.`
      : `${wires} ${leave} this session. Every one is disarmed.`
  }
  if (armed === total) {
    return `${wires} ${total === 1 ? 'fires' : 'fire'} when this session finishes.`
  }
  return `${wires} leave this session; ${armed} of them ${
    armed === 1 ? 'is' : 'are'
  } armed.`
}
