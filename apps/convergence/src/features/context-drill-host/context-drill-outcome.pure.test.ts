import { describe, expect, it } from 'vitest'
import {
  describeDrillBeatWord,
  describeDrillFailureTitle,
  describeDrillSuccess,
} from './context-drill-outcome.pure'

describe('describeDrillSuccess (MAR-3256 R4)', () => {
  it('names the crossing when both figures were measured', () => {
    expect(describeDrillSuccess(76, 9)).toBe('Context compacted: 76 % → 9 %')
  })

  it('says only that it compacted when the figure before is missing', () => {
    expect(describeDrillSuccess(null, 9)).toBe('Context compacted.')
  })

  it('says only that it compacted when the figure after is missing', () => {
    expect(describeDrillSuccess(76, null)).toBe('Context compacted.')
  })

  it('says only that it compacted when nothing was measured at all', () => {
    expect(describeDrillSuccess(null, null)).toBe('Context compacted.')
  })

  it('still names a crossing that went nowhere', () => {
    expect(describeDrillSuccess(0, 0)).toBe('Context compacted: 0 % → 0 %')
  })
})

describe('describeDrillBeatWord (MAR-3256 R4)', () => {
  it('reads the state machine’s resuming as waking up', () => {
    expect(describeDrillBeatWord('resuming')).toBe('waking up')
  })

  it('keeps the other two beats as they are', () => {
    expect(describeDrillBeatWord('sealing')).toBe('sealing')
    expect(describeDrillBeatWord('compacting')).toBe('compacting')
  })
})

describe('describeDrillFailureTitle (MAR-3256 R4)', () => {
  it('names the beat that stopped', () => {
    expect(describeDrillFailureTitle('sealing')).toBe(
      'The drill stopped while sealing',
    )
    expect(describeDrillFailureTitle('compacting')).toBe(
      'The drill stopped while compacting',
    )
    expect(describeDrillFailureTitle('resuming')).toBe(
      'The drill stopped while waking up',
    )
  })
})
