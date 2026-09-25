import { describe, expect, it } from 'vitest'
import {
  countSessionWires,
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

describe('CH1 R2 wire summary counts conditions', () => {
  it.each([
    [
      'all unconditional',
      [null, '  '],
      0,
      '2 wires fire when this session finishes.',
    ],
    [
      'all conditional',
      ['BATON: fable', 'BATON: horse'],
      0,
      '2 wires leave this session: 2 only if its last line matches.',
    ],
    [
      'mixed',
      [null, 'BATON: fable', 'BATON: horse'],
      1,
      '4 wires leave this session: 1 fires when it finishes, 2 only if its last line matches, 1 disarmed.',
    ],
    [
      'all disarmed',
      [],
      2,
      '2 wires leave this session. Every one is disarmed.',
    ],
    ['one disarmed', [], 1, '1 wire leaves this session, and it is disarmed.'],
    [
      'one unconditional',
      [null],
      0,
      '1 wire fires when this session finishes.',
    ],
    ['empty', [], 0, 'Nothing leaves this session.'],
    [
      'CH1 A DONE is a condition, not a BATON line',
      ['DONE'],
      0,
      '1 wire leaves this session: 1 only if its last line matches.',
    ],
  ] as const)('%s', (_name, tokens, off, expected) => {
    const wires = [
      ...tokens.map((conditionToken) => ({
        sourceSessionId: 's1',
        armed: true,
        conditionToken,
      })),
      ...Array.from({ length: off }, () => ({
        sourceSessionId: 's1',
        armed: false,
        conditionToken: 'BATON: fable',
      })),
    ]
    const { unconditional, conditional, disarmed } = countSessionWires(wires)
    expect(formatSessionWireSummary(unconditional, conditional, disarmed)).toBe(
      expected,
    )
  })
})
