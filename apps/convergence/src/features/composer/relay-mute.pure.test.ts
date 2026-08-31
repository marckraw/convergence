import { describe, expect, it } from 'vitest'
import { countArmedOutgoingRelays, relayMuteTitle } from './relay-mute.pure'

const WIRES = [
  { sourceSessionId: 's1', armed: true },
  { sourceSessionId: 's1', armed: true },
  { sourceSessionId: 's1', armed: false },
  { sourceSessionId: 's2', armed: true },
]

describe('countArmedOutgoingRelays', () => {
  it('counts only the armed wires that leave this session', () => {
    // Incoming wires are not this toggle's business: muting a send cannot stop
    // somebody else's session from hailing this one.
    expect(countArmedOutgoingRelays(WIRES, 's1')).toBe(2)
  })

  it('counts nothing for a session with only disarmed wires', () => {
    // A disarmed wire will not fire whatever the human does, so offering to
    // silence it would be offering to silence silence.
    expect(
      countArmedOutgoingRelays([{ sourceSessionId: 's3', armed: false }], 's3'),
    ).toBe(0)
  })

  it('counts nothing for an unwired or absent session', () => {
    expect(countArmedOutgoingRelays(WIRES, 's9')).toBe(0)
    expect(countArmedOutgoingRelays(WIRES, null)).toBe(0)
    expect(countArmedOutgoingRelays([], 's1')).toBe(0)
  })
})

describe('relayMuteTitle', () => {
  it('says what will happen, and that the switch does not stick', () => {
    expect(relayMuteTitle(true, 2)).toBe(
      'This send will not fire the 2 wires leaving this session. It resets after you send.',
    )
    expect(relayMuteTitle(false, 1)).toBe(
      'Sending will fire the 1 wire leaving this session. Switch this on to send quiet, once.',
    )
  })
})
