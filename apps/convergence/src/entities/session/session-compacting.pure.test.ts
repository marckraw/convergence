import { describe, expect, it } from 'vitest'
import {
  COMPACTING_CONTEXT_LABEL,
  isSessionCompacting,
} from './session-compacting.pure'

describe('isSessionCompacting (MAR-3288 R5)', () => {
  it('is true only while the activity is compacting', () => {
    expect(isSessionCompacting({ activity: 'compacting' })).toBe(true)
    expect(isSessionCompacting({ activity: null })).toBe(false)
    expect(isSessionCompacting({ activity: 'streaming' })).toBe(false)
    expect(isSessionCompacting({ activity: 'tool:Bash' })).toBe(false)
    expect(isSessionCompacting(null)).toBe(false)
    expect(isSessionCompacting(undefined)).toBe(false)
  })

  it('names the state in the words every surface uses', () => {
    expect(COMPACTING_CONTEXT_LABEL).toBe('Compacting context…')
  })
})
