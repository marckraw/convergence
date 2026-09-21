import { describe, expect, it } from 'vitest'
import {
  formatDrillBeatLabel,
  resolveSessionActivityLabel,
} from './context-drill-activity.pure'

describe('resolveSessionActivityLabel (MAR-3288 R8)', () => {
  it('names the beat while a drill runs, replacing the activity', () => {
    expect(resolveSessionActivityLabel(null, 'sealing')).toBe('drill · sealing')
    expect(resolveSessionActivityLabel('compacting', 'compacting')).toBe(
      'drill · compacting',
    )
    expect(resolveSessionActivityLabel('streaming', 'resuming')).toBe(
      'drill · resuming',
    )
  })

  it('withholds a plain compaction: the attention pill already says it (lap 2 A)', () => {
    expect(resolveSessionActivityLabel('compacting', null)).toBeNull()
    expect(resolveSessionActivityLabel('compacting', undefined)).toBeNull()
  })

  it('is exactly the activity label for every other activity', () => {
    expect(resolveSessionActivityLabel('streaming', null)).toBe('streaming…')
    expect(resolveSessionActivityLabel('thinking', undefined)).toBe('thinking…')
    expect(resolveSessionActivityLabel(null, null)).toBeNull()
  })

  it('formats every beat', () => {
    expect(formatDrillBeatLabel('compacting')).toBe('drill · compacting')
  })
})
