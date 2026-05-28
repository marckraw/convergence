import { describe, expect, it } from 'vitest'
import {
  assertProjectScriptRunStatus,
  normalizeProjectScriptIcon,
  normalizeProjectScriptOptionalCwd,
  normalizeProjectScriptRequiredText,
} from './project-scripts.pure'

describe('project script pure helpers', () => {
  it('trims required text and rejects blanks', () => {
    expect(normalizeProjectScriptRequiredText('  test  ', 'Script name')).toBe(
      'test',
    )
    expect(() =>
      normalizeProjectScriptRequiredText('   ', 'Script name'),
    ).toThrow('Script name is required')
  })

  it('defaults missing icons to play', () => {
    expect(normalizeProjectScriptIcon(undefined)).toBe('play')
    expect(normalizeProjectScriptIcon('test')).toBe('test')
  })

  it('normalizes optional cwd relative to a base path', () => {
    expect(normalizeProjectScriptOptionalCwd(undefined, '/repo')).toBeNull()
    expect(normalizeProjectScriptOptionalCwd('   ', '/repo')).toBeNull()
    expect(normalizeProjectScriptOptionalCwd('scripts', '/repo')).toBe(
      '/repo/scripts',
    )
  })

  it('accepts valid run statuses and rejects invalid values', () => {
    expect(() => assertProjectScriptRunStatus('queued')).not.toThrow()
    expect(() => assertProjectScriptRunStatus('invalid' as never)).toThrow(
      'Unknown project script run status: invalid',
    )
  })
})
