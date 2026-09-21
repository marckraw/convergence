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

  it('is exactly the activity label when no drill runs', () => {
    expect(resolveSessionActivityLabel('compacting', null)).toBe(
      'compacting context…',
    )
    expect(resolveSessionActivityLabel('thinking', undefined)).toBe('thinking…')
    expect(resolveSessionActivityLabel(null, null)).toBeNull()
  })

  it('formats every beat', () => {
    expect(formatDrillBeatLabel('compacting')).toBe('drill · compacting')
  })
})
