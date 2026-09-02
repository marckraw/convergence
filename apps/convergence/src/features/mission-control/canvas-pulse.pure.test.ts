import { describe, expect, it } from 'vitest'
import type { RelayHop } from '@/entities/session-relay'
import {
  buildWirePulses,
  collectNewHops,
  PULSE_ALARM_COLOR,
  pulseWireColor,
  pulseWireWidth,
} from './canvas-pulse.pure'

function hop(overrides: Partial<RelayHop> & { id: string }): RelayHop {
  return {
    relayId: 'r1',
    crewId: 'c1',
    flowRunId: 'run-1',
    firedAt: '2026-08-16T10:00:00.000Z',
    sourceSessionId: 'a',
    targetSessionId: 'b',
    spawnedSessionId: null,
    triggerStatus: 'completed',
    payloadPreview: 'Done.',
    baton: null,
    roundNumber: null,
    outcome: 'delivered',
    error: null,
    ...overrides,
  }
}

describe('collectNewHops', () => {
  it('lets through only the hops never seen before', () => {
    const hops = [hop({ id: 'h1' }), hop({ id: 'h2' }), hop({ id: 'h3' })]

    expect(
      collectNewHops(hops, new Set(['h1', 'h3'])).map((entry) => entry.id),
    ).toEqual(['h2'])
  })

  /**
   * The whole ledger arrives at once when a crew's trail first loads. Replaying
   * it as electricity would light every wire in the room on arrival.
   */
  it('stays dark when every hop is already known', () => {
    const hops = [hop({ id: 'h1' }), hop({ id: 'h2' })]

    expect(collectNewHops(hops, new Set(['h1', 'h2']))).toEqual([])
  })

  it('treats an empty memory as everything being new', () => {
    expect(collectNewHops([hop({ id: 'h1' })], new Set()).length).toBe(1)
  })
})

describe('buildWirePulses', () => {
  it('lights the wire the hop belongs to, with the hop’s own tone', () => {
    expect(buildWirePulses([hop({ id: 'h1', relayId: 'r7' })])).toEqual([
      { relayId: 'r7', hopId: 'h1', tone: 'delivered' },
    ])
  })

  it('lights each wire separately', () => {
    const pulses = buildWirePulses([
      hop({ id: 'h1', relayId: 'r1' }),
      hop({ id: 'h2', relayId: 'r2' }),
    ])

    expect(pulses.map((pulse) => pulse.relayId).sort()).toEqual(['r1', 'r2'])
  })

  it('shows one wire its latest hop rather than stacking flashes', () => {
    const pulses = buildWirePulses([
      hop({ id: 'h1', relayId: 'r1' }),
      hop({ id: 'h2', relayId: 'r1' }),
    ])

    expect(pulses).toHaveLength(1)
    expect(pulses[0].hopId).toBe('h2')
  })

  /** A failure that arrived alongside a success must not be painted over. */
  it('lets the loud outcome win a wire that fired twice at once', () => {
    const pulses = buildWirePulses([
      hop({ id: 'h1', relayId: 'r1', outcome: 'error', error: 'boom' }),
      hop({ id: 'h2', relayId: 'r1', outcome: 'delivered' }),
    ])

    expect(pulses[0]).toMatchObject({ tone: 'alarm', hopId: 'h1' })
  })

  it('files a hop written by another build as its own quiet tone', () => {
    const pulses = buildWirePulses([
      hop({ id: 'h1', outcome: 'skipped-disarmed' }),
    ])

    expect(pulses[0].tone).toBe('unknown')
  })
})

/**
 * Clearing a trail shrinks the list the canvas watches, and a still-running
 * flow leaves some of its rows behind. Neither is electricity: the seen-set is
 * only ever added to, so what survives a clear stays history.
 */
describe('after a trail is cleared', () => {
  it('does not relight the rows a live flow kept', () => {
    const kept = hop({ id: 'h2' })
    const seen = new Set(['h1', kept.id, 'h3'])

    expect(collectNewHops([kept], seen)).toEqual([])
  })

  it('still lights the first hop fired after the clear', () => {
    const kept = hop({ id: 'h2' })
    const afterwards = hop({ id: 'h4' })
    const seen = new Set(['h1', kept.id, 'h3'])

    expect(collectNewHops([afterwards, kept], seen)).toEqual([afterwards])
  })
})

describe('pulse styling', () => {
  it('keeps the crew’s colour for an ordinary hop', () => {
    expect(pulseWireColor('delivered', '#7c3aed')).toBe('#7c3aed')
  })

  it('overrides even a chosen accent when the hop was alarming', () => {
    expect(pulseWireColor('alarm', '#7c3aed')).toBe(PULSE_ALARM_COLOR)
  })

  it('thickens a lit wire, and an alarming one most of all', () => {
    expect(pulseWireWidth('delivered')).toBeGreaterThan(2)
    expect(pulseWireWidth('alarm')).toBeGreaterThan(pulseWireWidth('delivered'))
  })
})
