import { describe, it, expect } from 'vitest'
import { formatActivityLabel } from './session.activity.pure'

describe('formatActivityLabel', () => {
  it('returns null for null activity', () => {
    expect(formatActivityLabel(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(formatActivityLabel(undefined)).toBeNull()
  })

  it('formats streaming', () => {
    expect(formatActivityLabel('streaming')).toBe('streaming…')
  })

  it('formats thinking', () => {
    expect(formatActivityLabel('thinking')).toBe('thinking…')
  })

  it('formats compacting', () => {
    expect(formatActivityLabel('compacting')).toBe('compacting context…')
  })

  it('formats waiting-approval', () => {
    expect(formatActivityLabel('waiting-approval')).toBe('awaiting approval')
  })

  it('formats tool:name', () => {
    expect(formatActivityLabel('tool:bash')).toBe('tool: bash')
  })

  it('falls back to tool when name is blank', () => {
    expect(formatActivityLabel('tool:')).toBe('tool')
  })
})
