import type { RelayHop } from '@/entities/session-relay'
import { relayHopTone } from './relay-hop.pure'
import type { RelayHopTone } from './relay-hop.pure'

/**
 * How long a wire stays lit after one of its hops lands.
 *
 * Long enough to catch the eye of someone looking elsewhere on the canvas,
 * short enough that a busy loop reads as a pulse rather than a wire that is
 * simply always on.
 */
export const WIRE_PULSE_MS = 1800

/** Red-400: the same alarm colour the trail and the crew badge already use. */
export const PULSE_ALARM_COLOR = '#f87171'

export interface WirePulse {
  relayId: string
  hopId: string
  tone: RelayHopTone
}

/**
 * The hops that have landed since we last looked.
 *
 * The engine broadcasts one hop at a time, but a canvas that was mounted mid-
 * flight, or a crew whose trail just loaded, sees a batch arrive at once. Only
 * ids we have never seen may light a wire -- otherwise re-rendering the room
 * would replay every hop in the ledger as fresh electricity.
 */
export function collectNewHops(
  hops: readonly RelayHop[],
  seenHopIds: ReadonlySet<string>,
): RelayHop[] {
  return hops.filter((hop) => !seenHopIds.has(hop.id))
}

/**
 * The newest pulse per wire.
 *
 * A wire that fired twice in one batch shows its latest outcome rather than
 * two overlapping flashes, and an error is never overwritten by a delivery
 * that arrived in the same tick -- the loud one wins the wire.
 */
export function buildWirePulses(newHops: readonly RelayHop[]): WirePulse[] {
  const byRelay = new Map<string, WirePulse>()

  for (const hop of newHops) {
    const tone = relayHopTone(hop.outcome)
    const existing = byRelay.get(hop.relayId)
    if (existing && existing.tone === 'alarm' && tone !== 'alarm') continue
    byRelay.set(hop.relayId, { relayId: hop.relayId, hopId: hop.id, tone })
  }

  return [...byRelay.values()]
}

/**
 * What a lit wire is drawn in. An alarming hop overrides the crew's own accent:
 * a wire that just errored has to be findable across a canvas, and a crew that
 * picked a pretty colour must not be able to make its failures subtle.
 */
export function pulseWireColor(tone: RelayHopTone, baseColor: string): string {
  return tone === 'alarm' ? PULSE_ALARM_COLOR : baseColor
}

/** A lit wire thickens, so the pulse reads even where colour is hard to see. */
export function pulseWireWidth(tone: RelayHopTone): number {
  return tone === 'alarm' ? 3.5 : 3
}
