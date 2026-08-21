import { describe, expect, it } from 'vitest'
import {
  formatSessionWireCount,
  formatSessionWireSummary,
  selectOutgoingWires,
} from './session-wires.pure'

const WIRES = [
  { id: 'a', sourceSessionId: 's1', armed: true },
  { id: 'b', sourceSessionId: 's1', armed: false },
  { id: 'c', sourceSessionId: 's2', armed: true },
]

describe('selectOutgoingWires', () => {
  it('takes the wires that leave this session, armed or not', () => {
    // Disarmed wires belong here: from inside the session, a switched-off wire
    // is information, not absence.
    expect(selectOutgoingWires(WIRES, 's1').map((w) => w.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('ignores wires that only point at this session', () => {
    // An incoming wire fires when somebody ELSE finishes. Counting it here
    // would answer a question nobody asked from this screen.
    const incoming = [
      { id: 'in', sourceSessionId: 's9', targetSessionId: 's1', armed: true },
    ]
    expect(selectOutgoingWires(incoming, 's1')).toEqual([])
  })

  it('returns nothing for an unwired or absent session', () => {
    expect(selectOutgoingWires(WIRES, 's3')).toEqual([])
    expect(selectOutgoingWires(WIRES, null)).toEqual([])
  })
})

describe('formatSessionWireCount', () => {
  it('counts wires in words', () => {
    expect(formatSessionWireCount(1)).toBe('1 wire')
    expect(formatSessionWireCount(3)).toBe('3 wires')
  })
})

describe('formatSessionWireSummary', () => {
  it('says plainly what happens when this session finishes', () => {
    expect(formatSessionWireSummary(2, 2)).toBe(
      '2 wires fire when this session finishes.',
    )
  })

  it('agrees with itself about one wire', () => {
    expect(formatSessionWireSummary(1, 1)).toBe(
      '1 wire fires when this session finishes.',
    )
    expect(formatSessionWireSummary(1, 0)).toBe(
      '1 wire leaves this session, and it is disarmed.',
    )
  })

  it('does not let a disarmed wire look armed', () => {
    expect(formatSessionWireSummary(2, 0)).toBe(
      '2 wires leave this session. Every one is disarmed.',
    )
    expect(formatSessionWireSummary(3, 1)).toBe(
      '3 wires leave this session; 1 of them is armed.',
    )
    expect(formatSessionWireSummary(3, 2)).toBe(
      '3 wires leave this session; 2 of them are armed.',
    )
  })

  it('has an answer for a session nothing leaves', () => {
    expect(formatSessionWireSummary(0, 0)).toBe('Nothing leaves this session.')
  })
})
