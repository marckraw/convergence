import { describe, expect, it } from 'vitest'
import { resolveWhichCommand } from './which-binary.pure'

describe('resolveWhichCommand', () => {
  it('returns "where" on win32', () => {
    expect(resolveWhichCommand('win32')).toBe('where')
  })

  it('returns "which" on darwin', () => {
    expect(resolveWhichCommand('darwin')).toBe('which')
  })

  it('falls back to "which" on other platforms', () => {
    expect(resolveWhichCommand('linux')).toBe('which')
    expect(resolveWhichCommand('freebsd')).toBe('which')
  })
})
